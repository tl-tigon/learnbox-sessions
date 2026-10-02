/**
 * Q&A rules that need no storage: checking a question as it is asked, what a screen may see of
 * it, and the two orders a list can be shown in.
 */
import { LIMITS } from '../limits';
import { cleanText, isProfane } from './words';
import type { QaSlide, Question, QuestionStatus } from '../types';

/** A question without the asker's token. `name` is empty when it was asked anonymously. */
export interface PublicQuestion { id: string; text: string; name: string; votes: number; status: QuestionStatus; at: string }

export const publicQuestion = (q: Question): PublicQuestion => ({ id: q.id, text: q.text, name: q.name, votes: q.votes, status: q.status, at: q.at });

/** Statuses the whole audience sees. */
export const isShown = (status: QuestionStatus) => status === 'live' || status === 'answered';

export type CheckedQuestion = { ok: true; text: string; name: string } | { ok: false; error: string };

/** `nickname` is the name the person joined with, used when they send none with the question. */
export function checkQuestion(slide: QaSlide, raw: unknown, nickname: string): CheckedQuestion {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = cleanText(typeof r.text === 'string' ? r.text : '');
  if (!text) return { ok: false, error: 'Type a question' };
  if (text.length > LIMITS.questionChars) return { ok: false, error: `Up to ${LIMITS.questionChars} characters` };
  if (isProfane(text)) return { ok: false, error: 'That question has a blocked word' };
  if (slide.anonymous && r.anonymous === true) return { ok: true, text, name: '' };
  const name = cleanText(typeof r.nickname === 'string' ? r.nickname : '').slice(0, LIMITS.nicknameChars) || nickname;
  if (!name) return { ok: false, error: 'Add your name' };
  if (isProfane(name)) return { ok: false, error: 'Choose another name' };
  return { ok: true, text, name };
}

export type QuestionOrder = 'top' | 'recent';

/** Top: most votes first, older first on a tie. Recent: newest first. */
export function sortQuestions<T extends { votes: number; at: string }>(list: T[], order: QuestionOrder): T[] {
  return [...list].sort((a, b) => (order === 'top' ? b.votes - a.votes || a.at.localeCompare(b.at) : b.at.localeCompare(a.at)));
}
