/**
 * The AI features for the facilitator: a debrief of one interaction's results, and a follow-up
 * interaction written from them. The model sees aggregate results and, for written answers, a
 * bounded set of the texts, never a name or a token. Every request is counted against the plan's
 * monthly allowance and recorded with its tokens and cost.
 */
import { recount } from '../engine/answers';
import { cleanInteractions, isGroup, POLL_TYPES, shortId } from '../engine/polls';
import { cleanText } from '../engine/words';
import { limited } from '../http';
import { LIMITS, PLANS } from '../limits';
import { LiveError } from '../live';
import { planName, type PlanName } from '../plans';
import type { AiFeature, Debrief, Store } from '../store/types';
import type { Interaction, Poll, QuizQuestion, Session } from '../types';
import { AiError, aiModel, complete, FAILED, jsonIn } from './claude';
import { isMode, type FollowUpMode } from './modes';
import { DEBRIEF_SYSTEM, FOLLOWUP_MODES, FOLLOWUP_SYSTEM } from './prompts';

export const NOT_ENOUGH = 'Not enough responses yet. Get a few more participants to respond and try again.';
export const NOT_ENOUGH_TEXT = 'Not enough written answers yet for a useful debrief.';

/** One poll's or quiz question's result, as the model receives it: labels and counts, no ids, no people. */
interface ItemData {
  question: string;
  type: string;
  people: number;
  /** choice and quiz: option label to picks. ranking: label to points. rating: "1".."max" to votes. wordcloud: the most sent words. */
  distribution?: Record<string, number>;
  correct?: string;
  /** Written answers, the newest first, each cut to a length. */
  answers?: string[];
  scale?: string;
}
export interface InteractionData { session: string; kind: string; title: string; people: number; items: ItemData[] }

const sorted = (counts: Record<string, number>, top = 15) => Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, top));

/** Reads the stored answers of each poll in the interaction and sums them up for the model. */
export async function gather(db: Store, s: Session, i: Interaction): Promise<InteractionData> {
  const items: ItemData[] = [];
  const polls: (Poll | (QuizQuestion & { type: 'quiz' }))[] = i.type === 'quiz' ? i.questions.map((q) => ({ ...q, type: 'quiz' as const })) : isGroup(i) ? i.polls : [i];
  for (const p of polls) {
    const answers = await db.pollAnswers(s.id, p.id);
    const tally = recount(answers);
    const item: ItemData = { question: p.title, type: p.type, people: tally.people };
    if (p.type === 'choice' || p.type === 'ranking' || p.type === 'quiz') {
      item.distribution = Object.fromEntries(p.options.map((o) => [o.label || 'Untitled option', tally.counts[o.id] ?? 0]));
      if (p.type === 'quiz') item.correct = p.options.find((o) => o.id === p.correctId)?.label;
      if (p.type === 'ranking') item.type = 'ranking (points: first place earns most)';
    } else if (p.type === 'rating') {
      item.distribution = Object.fromEntries(Array.from({ length: p.max }, (_, n) => [String(n + 1), tally.counts[String(n + 1)] ?? 0]));
      item.scale = `1 (${p.lowLabel || 'low'}) to ${p.max} (${p.highLabel || 'high'})`;
    } else if (p.type === 'wordcloud') {
      item.distribution = sorted(tally.counts);
    } else {
      item.answers = answers.slice(-LIMITS.aiTextAnswers).reverse().map((a) => (a.answer.type === 'open' ? cleanText(a.answer.text).slice(0, LIMITS.aiAnswerChars) : '')).filter(Boolean);
    }
    items.push(item);
  }
  return { session: s.title, kind: i.type, title: i.type === 'feedback' ? 'Feedback' : i.title, people: Math.max(0, ...items.map((x) => x.people)), items };
}

/** Refuses a debrief of too little: fewer people than the minimum, or written answers with nothing usable in them. */
function enough(data: InteractionData) {
  if (data.people < LIMITS.aiMinPeople) throw new LiveError(409, NOT_ENOUGH);
  const written = data.items.filter((x) => x.answers);
  if (written.length === data.items.length && written.flatMap((x) => x.answers!).filter((t) => t.length >= 8).length < LIMITS.aiMinPeople) throw new LiveError(409, NOT_ENOUGH_TEXT);
}

const month = () => new Date().toISOString().slice(0, 7);
const LIMIT_KEY: Record<AiFeature, 'aiDebriefsPerMonth' | 'aiFollowUpsPerMonth'> = { debrief: 'aiDebriefsPerMonth', 'follow-up': 'aiFollowUpsPerMonth' };
const NAME: Record<AiFeature, string> = { debrief: 'debriefs', 'follow-up': 'follow-ups' };

export interface Usage { plan: PlanName; model: string | null; debrief: { used: number; limit: number }; followUp: { used: number; limit: number } }

/** What the account has used of its month's allowance. */
export async function aiUsage(db: Store, sub: string): Promise<Usage> {
  const plan = planName(await db.getAccount(sub));
  const used = await db.countAiUses(sub, month());
  return { plan, model: aiModel(), debrief: { used: used.debrief, limit: PLANS[plan].aiDebriefsPerMonth }, followUp: { used: used['follow-up'], limit: PLANS[plan].aiFollowUpsPerMonth } };
}

/** Lets a request through, or refuses it: AI off, too many in a minute, or the month's allowance used (402 on Free, where Pro would add more). */
async function allow(db: Store, sub: string, feature: AiFeature) {
  if (!aiModel()) throw new AiError(503, 'AI is not set up');
  if (limited(`ai:${sub}`, LIMITS.aiPerMinute)) throw new AiError(429, 'Too many requests. Wait a minute.');
  const plan = planName(await db.getAccount(sub));
  const limit = PLANS[plan][LIMIT_KEY[feature]];
  const used = (await db.countAiUses(sub, month()))[feature];
  if (used >= limit) {
    if (plan === 'free') throw new AiError(402, `AI ${NAME[feature]} on Free: ${limit} a month. Pro has ${PLANS.pro[LIMIT_KEY[feature]]}.`);
    throw new AiError(429, `This month's ${limit} AI ${NAME[feature]} are used.`);
  }
}

/** The model's text as one clean line. Over `max`, it is cut at a word and marked, not chopped mid-word. */
function tidy(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).trimEnd()}…`;
}

async function record(db: Store, sub: string, s: Session, interactionId: string, feature: AiFeature, c: { model: string; inputTokens: number; outputTokens: number; costUsd: number }) {
  await db.addAiUse({ id: shortId(), sub, sessionId: s.id, interactionId, feature, at: new Date().toISOString(), model: c.model, inputTokens: c.inputTokens, outputTokens: c.outputTokens, costUsd: c.costUsd });
}

const dataBlock = (data: unknown) => `<data>\n${JSON.stringify(data)}\n</data>`;

/* The development stand-in writes from the data, so the screens show something true to the session. */
function standInDebrief(data: InteractionData): string {
  const first = data.items[0];
  const top = first.distribution ? Object.entries(first.distribution).sort((a, b) => b[1] - a[1])[0] : null;
  const total = first.distribution ? Object.values(first.distribution).reduce((a, b) => a + b, 0) : 0;
  const happened = top && total
    ? `${data.people} people answered. "${top[0]}" was chosen most, ${top[1]} of ${total} (${Math.round((top[1] / total) * 100)}%).`
    : `${data.people} people answered "${first.question}" in writing.`;
  return JSON.stringify({
    happened,
    explore: `Observation: the answers are not evenly spread. Interpretation: the group may share one view of "${first.question}", or the wording may have pointed them to it.`,
    ask: [`What made you choose the way you did on "${first.question}"?`, 'Who sees it differently, and why?'],
    tip: 'Read the top result aloud, then give the room a minute in pairs before taking answers.',
  });
}

function standInFollowUp(data: InteractionData, mode: FollowUpMode): string {
  const topic = data.items[0].question;
  switch (mode) {
    case 'explore': return JSON.stringify({ type: 'open', question: `What is the biggest reason behind your answer to "${topic}"?`, note: 'Read three answers aloud, then ask who agrees.' });
    case 'probe': return JSON.stringify({ type: 'open', question: `If you chose the most common answer: what makes "${topic}" hard in practice?`, note: 'Ask the others to listen for what they would add.' });
    case 'challenge': return JSON.stringify({ type: 'choice', question: `A client says the opposite of what most of the room chose on "${topic}". What do you do?`, options: ['Hold the line', 'Ask what they have seen', 'Change the approach'], note: 'Take one voice for each option.' });
    case 'apply': return JSON.stringify({ type: 'open', question: `Your team meets tomorrow and "${topic}" comes up. What is the first thing you do?`, note: 'Look for answers that name a concrete action.' });
    case 'check': return JSON.stringify({ type: 'quiz', question: `Which statement about "${topic}" is correct?`, options: ['It depends on the context', 'It is always the same', 'It never matters', 'Nobody can tell'], correct: 0, note: 'Reveal, then ask someone who got it right to explain.' });
  }
}

/** The debrief of an interaction: the saved one unless `again`, else a new one from the stored answers. */
export async function debrief(db: Store, s: Session, interactionId: unknown, again: boolean, fail = false): Promise<{ debrief: Debrief; usage: Usage }> {
  const i = s.interactions.find((x) => x.id === interactionId);
  if (!i) throw new LiveError(404, 'Not found');
  const had = await db.getDebrief(s.id, i.id);
  if (had && !again) return { debrief: had, usage: await aiUsage(db, s.ownerSub) };
  const data = await gather(db, s, i);
  enough(data);
  await allow(db, s.ownerSub, 'debrief');

  const angle = had ? `\nThe previous debrief said: "${had.explore}". Take a different angle this time.` : '';
  const c = await complete(DEBRIEF_SYSTEM, `The interaction and its results so far.${angle}\n${dataBlock(data)}`, 600, () => standInDebrief(data), fail);
  await record(db, s.ownerSub, s, i.id, 'debrief', c);
  const j = jsonIn(c.text);
  const ask = Array.isArray(j?.ask) ? j.ask.map((q) => tidy(q, 300)).filter(Boolean).slice(0, 3) : [];
  const made: Debrief = { interactionId: i.id, happened: tidy(j?.happened, 600), explore: tidy(j?.explore, 600), ask, tip: tidy(j?.tip, 400), people: data.people, model: c.model, at: new Date().toISOString() };
  if (!made.happened || !made.explore || !made.tip || !ask.length) {
    console.error('debrief: unusable answer', c.text.slice(0, 200));
    throw new AiError(502, FAILED);
  }
  await db.putDebrief(s.id, made);
  return { debrief: made, usage: await aiUsage(db, s.ownerSub) };
}

export interface FollowUp { mode: FollowUpMode; interaction: Interaction; note: string }

/**
 * The next interaction, written from the previous one, its results and its debrief, in the mode
 * chosen. What comes back is built into an interaction through the same cleaning every saved
 * interaction goes through, so nothing the model wrote reaches the session as anything but text.
 */
export async function followUp(db: Store, s: Session, interactionId: unknown, mode: unknown, fail = false): Promise<{ followUp: FollowUp; usage: Usage }> {
  const i = s.interactions.find((x) => x.id === interactionId);
  if (!i) throw new LiveError(404, 'Not found');
  if (!isMode(mode)) throw new LiveError(400, 'Choose a mode');
  const had = await db.getDebrief(s.id, i.id);
  if (!had) throw new LiveError(409, 'Generate a debrief first');
  const data = await gather(db, s, i);
  await allow(db, s.ownerSub, 'follow-up');

  const msg = `Mode: ${FOLLOWUP_MODES[mode]}\nThe previous interaction, its results, and its debrief.\n${dataBlock({ ...data, debrief: { happened: had.happened, explore: had.explore } })}`;
  const c = await complete(FOLLOWUP_SYSTEM, msg, 400, () => standInFollowUp(data, mode), fail);
  await record(db, s.ownerSub, s, i.id, 'follow-up', c);
  const j = jsonIn(c.text);
  const type = typeof j?.type === 'string' ? j.type : '';
  const question = tidy(j?.question, LIMITS.titleChars);
  const options = (Array.isArray(j?.options) ? j.options : []).map((o) => tidy(o, LIMITS.optionChars)).filter(Boolean).slice(0, LIMITS.optionsPerChoice).map((label) => ({ id: shortId(), label }));
  const correct = typeof j?.correct === 'number' ? options[j.correct] : undefined;
  let raw: Record<string, unknown> | null = null;
  if (question && type === 'quiz' && options.length >= 2 && correct) {
    raw = { type: 'quiz', title: question, questions: [{ title: question, options: options.slice(0, LIMITS.quizOptions), correctId: correct.id, seconds: 20 }] };
  } else if (question && (type === 'choice' || type === 'ranking') && options.length >= 2) {
    raw = type === 'choice' ? { type, title: question, options, maxPicks: 1 } : { type, title: question, options };
  } else if (question && POLL_TYPES.includes(type as Poll['type']) && type !== 'choice' && type !== 'ranking') {
    raw = type === 'rating' ? { type, title: question, max: 5 } : { type, title: question, maxEntries: 1 };
  }
  const [interaction] = raw ? cleanInteractions([raw]) : [];
  if (!interaction || (interaction.type === 'quiz' && !options.slice(0, LIMITS.quizOptions).some((o) => o.id === correct?.id))) {
    console.error('follow-up: unusable answer', c.text.slice(0, 200));
    throw new AiError(502, FAILED);
  }
  return { followUp: { mode, interaction, note: tidy(j?.note, 200) }, usage: await aiUsage(db, s.ownerSub) };
}
