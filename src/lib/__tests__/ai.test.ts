import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { aiUsage, debrief, followUp, gather, NOT_ENOUGH, NOT_ENOUGH_TEXT } from '../ai';
import { estimateCost, FAILED } from '../ai/claude';
import { MODES } from '../ai/modes';
import { LIMITS, PLANS } from '../limits';
import { control, createSession, editSession, respond, respondQuiz } from '../live';
import { memoryStore } from '../store/memory';
import type { Store } from '../store/types';
import type { Session } from '../types';
import { INTERACTIONS, makePro, TOKEN } from './helpers';

const refusal = async (run: Promise<unknown>) => run.then(() => null, (e: { status?: number; message: string }) => `${e.status}: ${e.message}`);

/* A new account for each test: the per-minute guard is keyed by account. */
let n = 0;
const owner = () => `ai-owner-${++n}-${Date.now()}`;

/** A session with the test interactions, `people` phones joined, and the choice poll answered by all of them. */
async function voted(people = 3, db: Store = memoryStore()): Promise<{ db: Store; s: Session; sub: string }> {
  const sub = owner();
  await makePro(db, sub);
  const made = await createSession(db, sub, 'Team offsite');
  let s = await editSession(db, made, { interactions: INTERACTIONS });
  for (let i = 1; i <= people; i++) await db.join(s.id, TOKEN(i), `Person ${i}`, 1000);
  s = await control(db, s, { action: 'activate', id: 'choice1' });
  for (let i = 1; i <= people; i++) await respond(db, s, TOKEN(i), 'choice1', { optionIds: [i % 3 === 0 ? 'optb' : 'opta'] });
  return { db, s, sub };
}

beforeEach(() => {
  process.env.AUTH_MODE = 'dev';
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('what the model is given', () => {
  it('is aggregate: labels and counts, written answers cut and capped, and never a name or a token', async () => {
    const { db, s } = await voted(3);
    const choice = await gather(db, s, s.interactions[0]);
    expect(choice).toEqual({ session: 'Team offsite', kind: 'choice', title: 'Pick', people: 3, items: [{ question: 'Pick', type: 'choice', people: 3, distribution: { A: 2, B: 1, C: 0 } }] });

    let cur = await control(db, s, { action: 'activate', id: 'open1' });
    for (let i = 1; i <= 3; i++) await respond(db, cur, TOKEN(i), 'open1', { text: `Answer ${i} ${'x'.repeat(260)}` });
    const open = await gather(db, cur, cur.interactions[3]);
    expect(open.items[0].answers).toHaveLength(3);
    expect(open.items[0].answers![0].startsWith('Answer 3')).toBe(true);
    expect(open.items[0].answers!.every((t) => t.length <= LIMITS.aiAnswerChars)).toBe(true);

    cur = await control(db, cur, { action: 'activate', id: 'quiz1' });
    cur = await control(db, cur, { action: 'quiz-next' });
    await respondQuiz(db, cur, TOKEN(1), 'ques1', { optionId: 'qopb' });
    const quiz = await gather(db, cur, cur.interactions[6]);
    expect(quiz.items[0]).toEqual({ question: 'Largest?', type: 'quiz', people: 1, distribution: { Earth: 0, Jupiter: 1, Mars: 0 }, correct: 'Jupiter' });
    const text = JSON.stringify([choice, open, quiz]);
    expect(text).not.toMatch(/tok-|Person \d|opta|qopb/);
  });
});

describe('the debrief', () => {
  it('is made from the stored answers, kept for the interaction, and counted once per generation', async () => {
    const { db, s, sub } = await voted(3);
    const first = await debrief(db, s, 'choice1', false);
    expect(first.debrief).toMatchObject({ interactionId: 'choice1', people: 3, model: 'standin' });
    expect(first.debrief.happened).toMatch(/3 people answered/);
    expect(first.debrief.ask.length).toBeGreaterThan(0);
    expect(first.usage).toMatchObject({ plan: 'pro', debrief: { used: 1, limit: PLANS.pro.aiDebriefsPerMonth } });
    /* The same request again, as after a page refresh, costs nothing. */
    const again = await debrief(db, s, 'choice1', false);
    expect(again.debrief.at).toBe(first.debrief.at);
    expect(again.usage.debrief.used).toBe(1);
    /* "Generate another" does. */
    const another = await debrief(db, s, 'choice1', true);
    expect(another.usage.debrief.used).toBe(2);
    expect(await db.getDebrief(s.id, 'choice1')).toMatchObject({ at: another.debrief.at });
    expect((await db.countAiUses(sub, new Date().toISOString().slice(0, 7))).debrief).toBe(2);
  });

  it('refuses too little: fewer than the minimum people, or written answers with nothing in them', async () => {
    const { db, s } = await voted(LIMITS.aiMinPeople - 1);
    expect(await refusal(debrief(db, s, 'choice1', false))).toBe(`409: ${NOT_ENOUGH}`);
    expect(await refusal(debrief(db, s, 'nope', false))).toBe('404: Not found');
    const cur = await control(db, s, { action: 'activate', id: 'open1' });
    await db.join(s.id, TOKEN(9), '', 1000);
    for (const t of [TOKEN(1), TOKEN(2), TOKEN(9)]) await respond(db, cur, t, 'open1', { text: 'ok' });
    expect(await refusal(debrief(db, cur, 'open1', false))).toBe(`409: ${NOT_ENOUGH_TEXT}`);
    expect(await db.getDebrief(s.id, 'open1')).toBeNull();
  });

  it('fails cleanly when the model does, keeping the session as it was', async () => {
    const { db, s } = await voted(3);
    expect(await refusal(debrief(db, s, 'choice1', false, true))).toBe(`502: ${FAILED}`);
    expect(await db.getDebrief(s.id, 'choice1')).toBeNull();
  });

  it('calls the Anthropic API with the key and model from the environment, and records tokens and cost', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    process.env.ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        content: [{ type: 'text', text: 'Here you go:\n```json\n{"happened":"Two of three picked A.","explore":"Observation: A leads. Interpretation: the wording may favour it.","ask":["Why A?"],"tip":"Read it aloud."}\n```' }],
        usage: { input_tokens: 1000, output_tokens: 200 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const { db, s, sub } = await voted(3);
    const r = await debrief(db, s, 'choice1', false);
    expect(r.debrief).toMatchObject({ happened: 'Two of three picked A.', ask: ['Why A?'], model: 'claude-haiku-4-5-20251001' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test-key');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.system).toMatch(/Never invent statistics/);
    expect(body.messages[0].content).toMatch(/<data>/);
    expect(body.messages[0].content).not.toMatch(/tok-|Person \d/);
    const month = new Date().toISOString().slice(0, 7);
    expect((await db.countAiUses(sub, month)).debrief).toBe(1);
    expect(estimateCost('claude-haiku-4-5-20251001', 1000, 200)).toBe(0.002);

    /* The API answering with an error, or with something that is not a debrief, is the same clean failure. */
    vi.stubGlobal('fetch', async () => new Response('overloaded', { status: 529 }));
    expect(await refusal(debrief(db, s, 'choice1', true))).toBe(`502: ${FAILED}`);
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'I cannot help with that.' }], usage: { input_tokens: 5, output_tokens: 5 } }), { status: 200 }));
    expect(await refusal(debrief(db, s, 'choice1', true))).toBe(`502: ${FAILED}`);
    vi.stubGlobal('fetch', async () => { throw new TypeError('fetch failed'); });
    expect(await refusal(debrief(db, s, 'choice1', true))).toBe(`502: ${FAILED}`);
    expect((await db.getDebrief(s.id, 'choice1'))?.happened).toBe('Two of three picked A.');
  });

  it('is off, not broken, when no key is set outside development', async () => {
    process.env.AUTH_MODE = 'cognito';
    const { db, s } = await voted(3);
    expect((await aiUsage(db, s.ownerSub)).model).toBeNull();
    expect(await refusal(debrief(db, s, 'choice1', false))).toBe('503: AI is not set up');
  });
});

describe('the allowance', () => {
  const use = async (db: Store, sub: string, feature: 'debrief' | 'follow-up', times: number) => {
    for (let i = 0; i < times; i++) await db.addAiUse({ id: `u${i}`, sub, sessionId: 's', interactionId: 'x', feature, at: new Date().toISOString(), model: 'standin', inputTokens: 0, outputTokens: 0, costUsd: 0 });
  };

  it('is per plan and per month: Free is pointed to Pro, Pro is told the month is used', async () => {
    const db = memoryStore();
    const sub = owner();
    const made = await createSession(db, sub, 'Free session');
    let s = await editSession(db, made, { interactions: [INTERACTIONS[0]] });
    for (let i = 1; i <= 3; i++) await db.join(s.id, TOKEN(i), '', 1000);
    s = await control(db, s, { action: 'activate', id: 'choice1' });
    for (let i = 1; i <= 3; i++) await respond(db, s, TOKEN(i), 'choice1', { optionIds: ['opta'] });
    await use(db, sub, 'debrief', PLANS.free.aiDebriefsPerMonth);
    expect(await refusal(debrief(db, s, 'choice1', false))).toBe(`402: AI debriefs on Free: ${PLANS.free.aiDebriefsPerMonth} a month. Pro has ${PLANS.pro.aiDebriefsPerMonth}.`);
    expect((await aiUsage(db, sub)).debrief).toEqual({ used: PLANS.free.aiDebriefsPerMonth, limit: PLANS.free.aiDebriefsPerMonth });
    /* Last month's do not count. */
    await db.addAiUse({ id: 'old', sub, sessionId: 's', interactionId: 'x', feature: 'debrief', at: '2020-01-01T00:00:00.000Z', model: 'standin', inputTokens: 0, outputTokens: 0, costUsd: 0 });
    expect((await aiUsage(db, sub)).debrief.used).toBe(PLANS.free.aiDebriefsPerMonth);

    await makePro(db, sub);
    const ok = await debrief(db, s, 'choice1', false);
    expect(ok.usage.plan).toBe('pro');
    await use(db, sub, 'debrief', PLANS.pro.aiDebriefsPerMonth);
    expect(await refusal(debrief(db, s, 'choice1', true))).toBe(`429: This month's ${PLANS.pro.aiDebriefsPerMonth} AI debriefs are used.`);
  });

  it('holds an account to a few requests a minute', async () => {
    const { db, s } = await voted(3);
    for (let i = 0; i < LIMITS.aiPerMinute; i++) await debrief(db, s, 'choice1', true);
    expect(await refusal(debrief(db, s, 'choice1', true))).toBe('429: Too many requests. Wait a minute.');
  });
});

describe('the follow-up', () => {
  it('needs a debrief first and a known mode', async () => {
    const { db, s } = await voted(3);
    expect(await refusal(followUp(db, s, 'choice1', 'explore'))).toBe('409: Generate a debrief first');
    await debrief(db, s, 'choice1', false);
    expect(await refusal(followUp(db, s, 'choice1', 'rant'))).toBe('400: Choose a mode');
    expect(await refusal(followUp(db, s, 'nope', 'explore'))).toBe('404: Not found');
  });

  it('comes back as a cleaned interaction in every mode, which saves, starts and takes answers like any other', async () => {
    const { db, s, sub } = await voted(3);
    await debrief(db, s, 'choice1', false);
    let cur = await control(db, s, { action: 'activate', id: null });
    for (const mode of MODES) {
      const r = await followUp(db, cur, 'choice1', mode);
      const i = r.followUp.interaction;
      expect(r.followUp.mode).toBe(mode);
      expect(i.title.length).toBeGreaterThan(0);
      if (i.type === 'quiz') expect(i.questions[0].options.some((o) => o.id === i.questions[0].correctId)).toBe(true);
      /* Launched: saved after the one it follows, started, answered. */
      cur = await editSession(db, cur, { interactions: [...cur.interactions.slice(0, 1), i, ...cur.interactions.slice(1)], rev: cur.rev });
      expect(cur.interactions[1].id).toBe(i.id);
      cur = await control(db, cur, { action: 'activate', id: i.id });
      expect(cur.state.active).toBe(i.id);
      if (i.type === 'open') expect((await respond(db, cur, TOKEN(1), i.id, { text: 'Because it works' })).tally.people).toBe(1);
      if (i.type === 'choice') expect((await respond(db, cur, TOKEN(1), i.id, { optionIds: [i.options[0].id] })).tally.people).toBe(1);
      cur = await control(db, cur, { action: 'activate', id: null });
    }
    expect((await aiUsage(db, sub)).followUp.used).toBe(MODES.length);
  });

  it('keeps what the model wrote as text, within the limits, whatever it holds', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';
    const answer = (j: unknown) => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(j) }], usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200 });
    const { db, s } = await voted(3);
    vi.stubGlobal('fetch', async () => answer({ happened: 'x', explore: 'y', ask: ['z?'], tip: 't' }));
    await debrief(db, s, 'choice1', false);
    vi.stubGlobal('fetch', async () => answer({ type: 'quiz', question: '<script>alert(1)</script> Which is it?'.repeat(20), options: ['<b>A</b>', 'B', 'C', 'D', 'E', 'F'], correct: 1, note: 'n\u0000ote' }));
    const r = await followUp(db, s, 'choice1', 'check');
    const i = r.followUp.interaction;
    expect(i.type).toBe('quiz');
    if (i.type !== 'quiz') return;
    expect(i.title.length).toBeLessThanOrEqual(LIMITS.titleChars);
    expect(i.questions[0].options).toHaveLength(LIMITS.quizOptions);
    expect(i.questions[0].options[0].label).toBe('<b>A</b>');
    expect(i.questions[0].correctId).toBe(i.questions[0].options[1].id);
    expect(r.followUp.note).toBe('n ote');
    /* An unusable answer: a type that is not one of ours, a quiz with its correct option out of range, no question. */
    vi.stubGlobal('fetch', async () => answer({ type: 'essay', question: 'Write 500 words' }));
    expect(await refusal(followUp(db, s, 'choice1', 'explore'))).toBe(`502: ${FAILED}`);
    vi.stubGlobal('fetch', async () => answer({ type: 'quiz', question: 'Q?', options: ['A', 'B'], correct: 7 }));
    expect(await refusal(followUp(db, s, 'choice1', 'check'))).toBe(`502: ${FAILED}`);
    vi.stubGlobal('fetch', async () => answer({ type: 'open', question: '' }));
    expect(await refusal(followUp(db, s, 'choice1', 'explore'))).toBe(`502: ${FAILED}`);
  });
});

describe('the browser', () => {
  it('is given no key, model name or prompt: no page or component reads them', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f.name) && !/route\.dev\.ts$/.test(f.name)) files.push(p);
      }
    };
    for (const d of ['src/app', 'src/components']) walk(path.join(process.cwd(), d));
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/ANTHROPIC|lib\/ai\/(prompts|claude|index)'|from '@\/lib\/ai'/);
    }
  });
});
