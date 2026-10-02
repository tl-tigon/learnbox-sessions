/**
 * Checking what a person sends against the poll it answers, and what it adds to the live counts.
 *
 * The rules are kept apart from storage so they can be tested on their own and so the in-memory
 * and DynamoDB stores apply exactly the same ones.
 */
import { LIMITS } from '../limits';
import { cleanText, isProfane, normaliseWord } from './words';
import type { Answer, Poll, QuizQuestion } from '../types';

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

/** What taking an answer back removes from the counts: the opposite of what it added. */
export function undo(poll: Poll, answer: Answer): Record<string, number> {
  const c = checkAnswer(poll, answer);
  return c.ok ? Object.fromEntries(Object.entries(c.delta).map(([k, n]) => [k, -n])) : {};
}

/** Two count changes as one. Keys that cancel out are dropped. */
export function mergeDelta(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) + n;
  return Object.fromEntries(Object.entries(out).filter(([, n]) => n !== 0));
}
