/**
 * Checking what a person sends against the poll it answers, and what it adds to the live counts.
 *
 * The rules are kept apart from storage so they can be tested on their own and so the in-memory
 * and DynamoDB stores apply exactly the same ones.
 */
import { LIMITS } from '../limits';
import { cleanText, isProfane, normaliseWord } from './words';
import type { Answer, Poll, QuizQuestion, Tally } from '../types';

export type Checked =
  | { ok: true; answer: Answer; delta: Record<string, number>; maxEntries: number }
  | { ok: false; error: string };

const fail = (error: string): Checked => ({ ok: false, error });

export function checkAnswer(poll: Poll, raw: unknown): Checked {
  const r = (raw ?? {}) as Record<string, unknown>;
  switch (poll.type) {
    case 'choice': {
      const ids = Array.isArray(r.optionIds) ? [...new Set(r.optionIds.filter((x): x is string => typeof x === 'string'))] : [];
      const valid = new Set(poll.options.map((o) => o.id));
      if (!ids.length) return fail('Pick an option');
      if (ids.some((id) => !valid.has(id))) return fail('Unknown option');
      if (ids.length > poll.maxPicks) return fail(`Pick up to ${poll.maxPicks}`);
      return { ok: true, answer: { type: 'choice', optionIds: ids }, delta: Object.fromEntries(ids.map((id) => [id, 1])), maxEntries: 1 };
    }
    case 'rating': {
      const v = Number(r.value);
      if (!Number.isInteger(v) || v < 1 || v > poll.max) return fail(`Choose 1 to ${poll.max}`);
      return { ok: true, answer: { type: 'rating', value: v }, delta: { [String(v)]: 1 }, maxEntries: 1 };
    }
    case 'ranking': {
      /* Every option, each once. First place earns as many points as there are options, last place one. */
      const order = Array.isArray(r.order) ? r.order.filter((x): x is string => typeof x === 'string') : [];
      const ids = poll.options.map((o) => o.id);
      if (order.length !== ids.length || new Set(order).size !== ids.length || order.some((id) => !ids.includes(id))) return fail('Put every option in order');
      return { ok: true, answer: { type: 'ranking', order }, delta: Object.fromEntries(order.map((id, i) => [id, ids.length - i])), maxEntries: 1 };
    }
    case 'wordcloud': {
      const word = normaliseWord(typeof r.text === 'string' ? r.text : '');
      if (!word) return fail('Type a word');
      if (word.length > LIMITS.wordChars) return fail(`Up to ${LIMITS.wordChars} characters`);
      if (isProfane(word)) return fail('That word is blocked');
      return { ok: true, answer: { type: 'wordcloud', text: word }, delta: { [word]: 1 }, maxEntries: poll.maxEntries };
    }
    case 'open': {
      const text = cleanText(typeof r.text === 'string' ? r.text : '');
      if (!text) return fail('Type an answer');
      if (text.length > LIMITS.openChars) return fail(`Up to ${LIMITS.openChars} characters`);
      if (isProfane(text)) return fail('That answer has a blocked word');
      return { ok: true, answer: { type: 'open', text }, delta: {}, maxEntries: poll.maxEntries };
    }
  }
}

/** A quiz answer: one option of the question. */
export function checkQuizAnswer(question: QuizQuestion, raw: unknown): Checked {
  const id = (raw as { optionId?: unknown } | null)?.optionId;
  if (typeof id !== 'string' || !question.options.some((o) => o.id === id)) return fail('Pick an option');
  return { ok: true, answer: { type: 'quiz', optionId: id }, delta: { [id]: 1 }, maxEntries: 1 };
}

/** Polls where a person has one answer, which they may change while voting is open. */
export const canChange = (poll: Poll) => poll.type === 'choice' || poll.type === 'rating' || poll.type === 'ranking';

/**
 * What a stored answer added to the counts. It is read from the answer itself, not checked
 * against the poll, so it stays right after the facilitator edits the poll's options.
 */
export function added(answer: Answer): Record<string, number> {
  switch (answer.type) {
    case 'choice': return Object.fromEntries(answer.optionIds.map((id) => [id, 1]));
    case 'rating': return { [String(answer.value)]: 1 };
    case 'ranking': return Object.fromEntries(answer.order.map((id, i) => [id, answer.order.length - i]));
    case 'wordcloud': return { [answer.text]: 1 };
    case 'quiz': return { [answer.optionId]: 1 };
    case 'open': return {};
  }
}

/** What taking an answer back removes from the counts: the opposite of what it added. */
export const undo = (answer: Answer): Record<string, number> => Object.fromEntries(Object.entries(added(answer)).map(([k, n]) => [k, -n]));

/** One person's answers to a poll as a line of text, for a table: the option labels, the rating, the order, or what they wrote. */
export function answerText(poll: Poll, answers: Answer[]): string {
  const label = (id: string) => ('options' in poll ? poll.options.find((o) => o.id === id)?.label ?? '' : '');
  return answers.map((a) => {
    switch (a.type) {
      case 'choice': return a.optionIds.map(label).join(', ');
      case 'rating': return String(a.value);
      case 'ranking': return a.order.map((id, i) => `${i + 1}. ${label(id)}`).join(', ');
      case 'wordcloud': case 'open': return a.text;
      case 'quiz': return label(a.optionId);
    }
  }).filter(Boolean).join('; ');
}

/** Counts worked out afresh from the stored answers, which are the truth; the running counts are only a fast copy. */
export function recount(answers: { token: string; answer: Answer }[]): Tally {
  const counts: Record<string, number> = {};
  for (const a of answers) for (const [k, n] of Object.entries(added(a.answer))) counts[k] = (counts[k] ?? 0) + n;
  return { people: new Set(answers.map((a) => a.token)).size, counts };
}

/** Two count changes as one. Keys that cancel out are dropped. */
export function mergeDelta(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) + n;
  return Object.fromEntries(Object.entries(out).filter(([, n]) => n !== 0));
}
