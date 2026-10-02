/**
 * Checking what a person sends against the slide it answers, and what it adds to the live counts.
 *
 * The rules are kept apart from storage so they can be tested on their own and so the in-memory
 * and DynamoDB stores apply exactly the same ones.
 */
import { LIMITS } from '../limits';
import { cleanText, isProfane, normaliseWord } from './words';
import type { Answer, Slide } from '../types';

export type Checked =
  | { ok: true; answer: Answer; delta: Record<string, number>; maxEntries: number }
  | { ok: false; error: string };

const fail = (error: string): Checked => ({ ok: false, error });

export function checkAnswer(slide: Slide, raw: unknown): Checked {
  const r = (raw ?? {}) as Record<string, unknown>;
  switch (slide.type) {
    case 'choice': {
      const ids = Array.isArray(r.optionIds) ? [...new Set(r.optionIds.filter((x): x is string => typeof x === 'string'))] : [];
      const valid = new Set(slide.options.map((o) => o.id));
      if (!ids.length) return fail('Pick an option');
      if (ids.some((id) => !valid.has(id))) return fail('Unknown option');
      if (ids.length > slide.maxPicks) return fail(`Pick up to ${slide.maxPicks}`);
      return { ok: true, answer: { type: 'choice', optionIds: ids }, delta: Object.fromEntries(ids.map((id) => [id, 1])), maxEntries: 1 };
    }
    case 'rating': {
      const v = Number(r.value);
      if (!Number.isInteger(v) || v < 1 || v > slide.max) return fail(`Choose 1 to ${slide.max}`);
      return { ok: true, answer: { type: 'rating', value: v }, delta: { [String(v)]: 1 }, maxEntries: 1 };
    }
    case 'wordcloud': {
      const word = normaliseWord(typeof r.text === 'string' ? r.text : '');
      if (!word) return fail('Type a word');
      if (word.length > LIMITS.wordChars) return fail(`Up to ${LIMITS.wordChars} characters`);
      if (isProfane(word)) return fail('That word is blocked');
      return { ok: true, answer: { type: 'wordcloud', text: word }, delta: { [word]: 1 }, maxEntries: slide.maxEntries };
    }
    case 'open': {
      const text = cleanText(typeof r.text === 'string' ? r.text : '');
      if (!text) return fail('Type an answer');
      if (text.length > LIMITS.openChars) return fail(`Up to ${LIMITS.openChars} characters`);
      if (isProfane(text)) return fail('That answer has a blocked word');
      return { ok: true, answer: { type: 'open', text }, delta: {}, maxEntries: slide.maxEntries };
    }
    case 'qa':
    case 'content':
      return fail('This slide takes no answer');
  }
}
