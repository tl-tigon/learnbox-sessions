import { describe, expect, it } from 'vitest';
import { memoryStore } from '../store/memory';
import { applyControl, control, respond, startSession, audienceView, screenView, endSession, LiveError } from '../live';
import { checkAnswer } from '../engine/answers';
import { cleanSlides } from '../engine/slides';
import { isProfane, normaliseWord } from '../engine/words';
import type { Presentation, Session } from '../types';

const TOKEN = (n: number) => `tok-${String(n).padStart(16, '0')}`;

function deck(): Presentation {
  const slides = cleanSlides([
    { id: 'aaaa1', type: 'choice', title: 'Pick', maxPicks: 1, options: [{ id: 'opta', label: 'A' }, { id: 'optb', label: 'B' }] },
    { id: 'bbbb2', type: 'wordcloud', title: 'One word', maxEntries: 3 },
    { id: 'cccc3', type: 'rating', title: 'Rate', max: 5 },
    { id: 'dddd4', type: 'open', title: 'Say', maxEntries: 1 },
    { id: 'eeee5', type: 'content', title: 'Thanks', body: '' },
  ]);
  const now = new Date().toISOString();
  return { id: 'p1', ownerSub: 'u1', title: 'Deck', slides, createdAt: now, updatedAt: now };
}

async function running(mode: 'presenter' | 'survey' = 'presenter') {
  const db = memoryStore();
  const s = await startSession(db, 'u1', deck(), mode);
  return { db, s };
}

describe('answers', () => {
  it('choice: refuses unknown options and too many picks', () => {
    const slide = deck().slides[0];
    expect(checkAnswer(slide, { optionIds: ['nope'] }).ok).toBe(false);
    expect(checkAnswer(slide, { optionIds: ['opta', 'optb'] }).ok).toBe(false);
    expect(checkAnswer(slide, { optionIds: ['opta'] })).toMatchObject({ ok: true, delta: { opta: 1 } });
  });
  it('rating: stays on the scale', () => {
    const slide = deck().slides[2];
    expect(checkAnswer(slide, { value: 0 }).ok).toBe(false);
    expect(checkAnswer(slide, { value: 6 }).ok).toBe(false);
    expect(checkAnswer(slide, { value: 2.5 }).ok).toBe(false);
    expect(checkAnswer(slide, { value: 5 })).toMatchObject({ ok: true, delta: { '5': 1 } });
  });
  it('words: normalised to one form, profanity blocked', () => {
    expect(normaliseWord('  Trust. ')).toBe('trust');
    expect(normaliseWord('TRUST!!')).toBe('trust');
    expect(isProfane('sh1t')).toBe(true);
    expect(isProfane('Scunthorpe')).toBe(false);
    expect(isProfane('classic')).toBe(false);
    expect(checkAnswer(deck().slides[1], { text: 'fuck' }).ok).toBe(false);
  });
});

describe('sessions', () => {
  it('a code points at one live session; ending frees it', async () => {
    const db = memoryStore();
    const s1 = await startSession(db, 'u1', deck(), 'presenter');
    expect(await db.sessionIdForCode(s1.code)).toBe(s1.id);
    const clash: Session = { ...s1, id: 'other' };
    expect(await db.createSession(clash)).toBe(false);
    await endSession(db, s1);
    expect(await db.sessionIdForCode(s1.code)).toBeNull();
    expect(await db.createSession(clash)).toBe(true);
  });

  it('caps live sessions per account', async () => {
    const db = memoryStore();
    for (let i = 0; i < 3; i++) await startSession(db, 'u1', deck(), 'presenter');
    await expect(startSession(db, 'u1', deck(), 'presenter')).rejects.toBeInstanceOf(LiveError);
    await expect(startSession(db, 'u2', deck(), 'presenter')).resolves.toBeTruthy();
  });

  it('a control made from an old state is not applied over a newer one', async () => {
    const { db, s } = await running();
    const a = applyControl(s, { action: 'next' });
    expect(await db.setState(s.id, a, s.state.seq)).not.toBeNull();
    const stale = applyControl(s, { action: 'lock', on: true });
    expect(await db.setState(s.id, stale, s.state.seq)).toBeNull();
    /* control() re-reads and applies on top of the latest */
    const after = await control(db, s, { action: 'lock', on: true });
    expect(after.state).toMatchObject({ current: 1, locked: true, seq: 3 });
  });

  it('moving slides clamps to the deck and reopens answers', async () => {
    const { db, s } = await running();
    let cur = await control(db, s, { action: 'lock', on: true });
    cur = await control(db, cur, { action: 'go', index: 99 });
    expect(cur.state).toMatchObject({ current: 4, locked: false });
    cur = await control(db, cur, { action: 'prev' });
    expect(cur.state.current).toBe(3);
  });
});

describe('answering', () => {
  it('one answer per person on a single-answer slide, even when sent many times at once', async () => {
    const { db, s } = await running();
    await db.join(s.id, TOKEN(1), '', 1000);
    const sends = await Promise.allSettled(Array.from({ length: 10 }, () => respond(db, s, TOKEN(1), 'aaaa1', { optionIds: ['opta'] })));
    expect(sends.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.getTally(s.id, 'aaaa1')).toEqual({ people: 1, counts: { opta: 1 } });
  });

  it('counts equal the stored answers', async () => {
    const { db, s } = await running();
    for (let i = 0; i < 25; i++) {
      await db.join(s.id, TOKEN(i), '', 1000);
      await respond(db, s, TOKEN(i), 'aaaa1', { optionIds: [i % 3 ? 'opta' : 'optb'] });
    }
    const answers = await db.slideAnswers(s.id, 'aaaa1');
    const t = await db.getTally(s.id, 'aaaa1');
    expect(t.people).toBe(answers.length);
    expect(t.counts.opta + t.counts.optb).toBe(answers.length);
  });

  it('word cloud: up to the set number of words, one person counted once', async () => {
    const { db, s } = await running();
    let cur = await control(db, s, { action: 'next' });
    await db.join(s.id, TOKEN(1), '', 1000);
    await respond(db, cur, TOKEN(1), 'bbbb2', { text: 'Trust' });
    await respond(db, cur, TOKEN(1), 'bbbb2', { text: 'trust.' });
    const last = await respond(db, cur, TOKEN(1), 'bbbb2', { text: 'Speed' });
    expect(last.done).toBe(true);
    await expect(respond(db, cur, TOKEN(1), 'bbbb2', { text: 'more' })).rejects.toThrow(/most allowed/);
    expect(await db.getTally(s.id, 'bbbb2')).toEqual({ people: 1, counts: { trust: 2, speed: 1 } });
  });

  it('refuses answers to a slide the presenter is not on, a locked slide, an unjoined phone and an ended session', async () => {
    const { db, s } = await running();
    await db.join(s.id, TOKEN(1), '', 1000);
    await expect(respond(db, s, TOKEN(1), 'cccc3', { value: 3 })).rejects.toThrow(/moved on/);
    await expect(respond(db, s, TOKEN(2), 'aaaa1', { optionIds: ['opta'] })).rejects.toThrow(/Join/);
    const locked = await control(db, s, { action: 'lock', on: true });
    await expect(respond(db, locked, TOKEN(1), 'aaaa1', { optionIds: ['opta'] })).rejects.toThrow(/closed/);
    await endSession(db, locked);
    const ended = (await db.getSession(s.id))!;
    await expect(respond(db, ended, TOKEN(1), 'aaaa1', { optionIds: ['opta'] })).rejects.toThrow(/ended/);
  });

  it('survey mode takes answers on any slide, in any order', async () => {
    const { db, s } = await running('survey');
    await db.join(s.id, TOKEN(1), '', 1000);
    await respond(db, s, TOKEN(1), 'cccc3', { value: 4 });
    await respond(db, s, TOKEN(1), 'aaaa1', { optionIds: ['optb'] });
    expect((await db.getTally(s.id, 'cccc3')).counts).toEqual({ '4': 1 });
  });

  it('the people cap refuses newcomers but lets people already in come back', async () => {
    const { db, s } = await running();
    expect((await db.join(s.id, TOKEN(1), '', 2)).full).toBe(false);
    expect((await db.join(s.id, TOKEN(2), '', 2)).full).toBe(false);
    expect((await db.join(s.id, TOKEN(3), '', 2)).full).toBe(true);
    expect((await db.join(s.id, TOKEN(1), '', 2)).full).toBe(false);
  });
});

describe('views', () => {
  it('phones see results only when shown; the screen always does', async () => {
    const { db, s } = await running();
    await db.join(s.id, TOKEN(1), '', 1000);
    await respond(db, s, TOKEN(1), 'aaaa1', { optionIds: ['opta'] });
    const hidden = await control(db, s, { action: 'results', on: false });
    const phone = await audienceView(db, hidden, TOKEN(1));
    expect(phone).toMatchObject({ joined: true, tally: null, mine: [{ type: 'choice', optionIds: ['opta'] }] });
    const screen = await screenView(db, hidden);
    expect(screen.tally).toEqual({ people: 1, counts: { opta: 1 } });
    expect(screen.people).toBe(1);
  });
});
