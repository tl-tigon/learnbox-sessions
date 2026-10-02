/**
 * Slides as the editor sends them, checked and normalised before they are stored.
 * Anything out of bounds is clipped rather than refused, so an editor save never fails on a detail.
 */
import { LIMITS } from '../limits';
import { cleanText } from './words';
import type { ChoiceOption, Slide, SlideType } from '../types';

export const SLIDE_TYPES: SlideType[] = ['choice', 'wordcloud', 'rating', 'open', 'qa', 'quiz', 'leaderboard', 'content'];
export const QUIZ_SECONDS = [10, 20, 30, 60];

const clip = (s: unknown, n: number) => cleanText(typeof s === 'string' ? s : '').slice(0, n);
const int = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const shortId = () => Math.random().toString(36).slice(2, 10);
const okId = (v: unknown) => (typeof v === 'string' && /^[a-z0-9]{4,16}$/.test(v) ? v : shortId());

/** A new slide of a type, with the settings a facilitator would most often want. */
export function blankSlide(type: SlideType): Slide {
  const id = shortId();
  switch (type) {
    case 'choice':
      return { id, type, title: '', maxPicks: 1, options: [{ id: shortId(), label: '' }, { id: shortId(), label: '' }] };
    case 'wordcloud':
      return { id, type, title: '', maxEntries: 3 };
    case 'rating':
      return { id, type, title: '', max: 5, lowLabel: '', highLabel: '' };
    case 'open':
      return { id, type, title: '', maxEntries: 1 };
    case 'qa':
      return { id, type, title: '', moderation: false, anonymous: true };
    case 'quiz': {
      const options = [{ id: shortId(), label: '' }, { id: shortId(), label: '' }];
      return { id, type, title: '', options, correctId: options[0].id, seconds: 20 };
    }
    case 'leaderboard':
      return { id, type, title: 'Leaderboard' };
    case 'content':
      return { id, type, title: '', body: '' };
  }
}

export function cleanSlide(raw: unknown): Slide | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as SlideType;
  if (!SLIDE_TYPES.includes(type)) return null;
  const id = okId(r.id);
  const title = clip(r.title, LIMITS.titleChars);
  const cleanOptions = (max: number): ChoiceOption[] => {
    const seen = new Set<string>();
    return (Array.isArray(r.options) ? r.options : []).slice(0, max).map((o) => {
      const oo = (o ?? {}) as Record<string, unknown>;
      let oid = okId(oo.id);
      while (seen.has(oid)) oid = shortId();
      seen.add(oid);
      return { id: oid, label: clip(oo.label, LIMITS.optionChars) };
    });
  };
  switch (type) {
    case 'choice': {
      const options = cleanOptions(LIMITS.optionsPerChoice);
      return { id, type, title, options, maxPicks: int(r.maxPicks, 1, Math.max(1, options.length), 1) };
    }
    case 'quiz': {
      const options = cleanOptions(LIMITS.quizOptions);
      while (options.length < 2) options.push({ id: shortId(), label: '' });
      const correctId = options.some((o) => o.id === r.correctId) ? (r.correctId as string) : options[0].id;
      const seconds = QUIZ_SECONDS.includes(Number(r.seconds)) ? Number(r.seconds) : 20;
      return { id, type, title, options, correctId, seconds };
    }
    case 'leaderboard':
      return { id, type, title };
    case 'wordcloud':
      return { id, type, title, maxEntries: int(r.maxEntries, 1, LIMITS.entriesPerPerson, 3) };
    case 'rating':
      return {
        id, type, title,
        max: int(r.max, 3, 10, 5),
        lowLabel: clip(r.lowLabel, LIMITS.optionChars),
        highLabel: clip(r.highLabel, LIMITS.optionChars),
      };
    case 'open':
      return { id, type, title, maxEntries: int(r.maxEntries, 1, LIMITS.entriesPerPerson, 1) };
    case 'qa':
      return { id, type, title, moderation: r.moderation === true, anonymous: r.anonymous !== false };
    case 'content':
      return { id, type, title, body: clip(r.body, LIMITS.contentChars) };
  }
}

/** The whole deck: unknown slides dropped, duplicate ids replaced, capped in length. */
export function cleanSlides(raw: unknown): Slide[] {
  const seen = new Set<string>();
  const out: Slide[] = [];
  for (const s of Array.isArray(raw) ? raw.slice(0, LIMITS.slidesPerPresentation) : []) {
    const c = cleanSlide(s);
    if (!c) continue;
    while (seen.has(c.id)) c.id = shortId();
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/** Slides that take an answer. A Q&A slide takes questions instead; a heading and a leaderboard take nothing. */
export const isInteractive = (s: Slide) => s.type === 'choice' || s.type === 'wordcloud' || s.type === 'rating' || s.type === 'open' || s.type === 'quiz';
/** Slides whose answers the presenter can close, and whose results can be shown or hidden. */
export const isPoll = (s: Slide) => isInteractive(s) && s.type !== 'quiz';
