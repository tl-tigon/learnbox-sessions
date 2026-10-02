/**
 * Interactions as the facilitator's screen sends them, checked and normalised before they are
 * stored. Anything out of bounds is clipped rather than refused, so a save never fails on a detail.
 */
import { LIMITS } from '../limits';
import { cleanText } from './words';
import type { ChoiceOption, Interaction, InteractionType, Poll, PollType, QuizQuestion } from '../types';

export const POLL_TYPES: PollType[] = ['choice', 'wordcloud', 'rating', 'open', 'ranking'];
export const INTERACTION_TYPES: InteractionType[] = [...POLL_TYPES, 'quiz', 'survey'];
export const QUIZ_SECONDS = [10, 20, 30, 60];

const clip = (s: unknown, n: number) => cleanText(typeof s === 'string' ? s : '').slice(0, n);
const int = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
export const shortId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
const okId = (v: unknown) => (typeof v === 'string' && /^[a-z0-9]{4,16}$/.test(v) ? v : shortId());

const blankOptions = (): ChoiceOption[] => [{ id: shortId(), label: '' }, { id: shortId(), label: '' }];

export function blankQuizQuestion(): QuizQuestion {
  const options = blankOptions();
  return { id: shortId(), title: '', options, correctId: options[0].id, seconds: 20 };
}

export function blankPoll(type: PollType): Poll {
  const id = shortId();
  switch (type) {
    case 'choice': return { id, type, title: '', maxPicks: 1, options: blankOptions() };
    case 'wordcloud': return { id, type, title: '', maxEntries: 3 };
    case 'rating': return { id, type, title: '', max: 5, lowLabel: '', highLabel: '' };
    case 'open': return { id, type, title: '', maxEntries: 1 };
    case 'ranking': return { id, type, title: '', options: [...blankOptions(), { id: shortId(), label: '' }] };
  }
}

/** A new interaction of a type, with the settings a facilitator would most often want. */
export function blankInteraction(type: InteractionType): Interaction {
  if (type === 'quiz') return { id: shortId(), type, title: '', questions: [blankQuizQuestion()] };
  if (type === 'survey') return { id: shortId(), type, title: '', polls: [blankPoll('choice')] };
  return blankPoll(type);
}

/** Ids already taken in the session, so no two polls, quiz questions or options of one poll collide. */
type Seen = Set<string>;
const fresh = (seen: Seen, wanted: unknown) => {
  let id = okId(wanted);
  while (seen.has(id)) id = shortId();
  seen.add(id);
  return id;
};

function cleanOptions(raw: unknown, max: number, min: number): ChoiceOption[] {
  const seen: Seen = new Set();
  const options = (Array.isArray(raw) ? raw : []).slice(0, max).map((o) => {
    const oo = (o ?? {}) as Record<string, unknown>;
    return { id: fresh(seen, oo.id), label: clip(oo.label, LIMITS.optionChars) };
  });
  while (options.length < min) options.push({ id: fresh(seen, null), label: '' });
  return options;
}

function cleanPoll(raw: unknown, seen: Seen): Poll | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as PollType;
  if (!POLL_TYPES.includes(type)) return null;
  const id = fresh(seen, r.id);
  const title = clip(r.title, LIMITS.titleChars);
  switch (type) {
    case 'choice': {
      const options = cleanOptions(r.options, LIMITS.optionsPerChoice, 2);
      return { id, type, title, options, maxPicks: int(r.maxPicks, 1, options.length, 1) };
    }
    case 'wordcloud': return { id, type, title, maxEntries: int(r.maxEntries, 1, LIMITS.entriesPerPerson, 3) };
    case 'rating': return { id, type, title, max: int(r.max, 3, 10, 5), lowLabel: clip(r.lowLabel, LIMITS.optionChars), highLabel: clip(r.highLabel, LIMITS.optionChars) };
    case 'open': return { id, type, title, maxEntries: int(r.maxEntries, 1, LIMITS.entriesPerPerson, 1) };
    case 'ranking': return { id, type, title, options: cleanOptions(r.options, LIMITS.optionsPerChoice, 2) };
  }
}

function cleanQuizQuestion(raw: unknown, seen: Seen): QuizQuestion {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const options = cleanOptions(r.options, LIMITS.quizOptions, 2);
  return {
    id: fresh(seen, r.id),
    title: clip(r.title, LIMITS.titleChars),
    options,
    correctId: options.some((o) => o.id === r.correctId) ? (r.correctId as string) : options[0].id,
    seconds: QUIZ_SECONDS.includes(Number(r.seconds)) ? Number(r.seconds) : 20,
  };
}

function cleanInteraction(raw: unknown, seen: Seen): Interaction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.type === 'quiz') {
    const id = fresh(seen, r.id);
    const questions = (Array.isArray(r.questions) ? r.questions : []).slice(0, LIMITS.itemsPerGroup).map((q) => cleanQuizQuestion(q, seen));
    if (!questions.length) questions.push(cleanQuizQuestion(null, seen));
    return { id, type: 'quiz', title: clip(r.title, LIMITS.titleChars), questions };
  }
  if (r.type === 'survey') {
    const id = fresh(seen, r.id);
    const polls = (Array.isArray(r.polls) ? r.polls : []).slice(0, LIMITS.itemsPerGroup).map((p) => cleanPoll(p, seen)).filter((p): p is Poll => !!p);
    return { id, type: 'survey', title: clip(r.title, LIMITS.titleChars), polls };
  }
  return cleanPoll(raw, seen);
}

/** The whole list: unknown types dropped, duplicate ids replaced, capped in length. */
export function cleanInteractions(raw: unknown): Interaction[] {
  const seen: Seen = new Set();
  const out: Interaction[] = [];
  for (const item of Array.isArray(raw) ? raw.slice(0, LIMITS.interactionsPerSession) : []) {
    const c = cleanInteraction(item, seen);
    if (c) out.push(c);
  }
  return out;
}

export const isPoll = (i: Interaction): i is Poll => i.type !== 'quiz' && i.type !== 'survey';

/** A poll by id, wherever it sits: on its own, or inside a survey. */
export function findPoll(interactions: Interaction[], pollId: string): { poll: Poll; parent: Interaction } | null {
  for (const i of interactions) {
    if (i.type === 'survey') {
      const poll = i.polls.find((p) => p.id === pollId);
      if (poll) return { poll, parent: i };
    } else if (i.type !== 'quiz' && i.id === pollId) return { poll: i, parent: i };
  }
  return null;
}

/** A copy with every id new, for a duplicated session. */
export function withNewIds(interactions: Interaction[]): Interaction[] {
  const map = new Map<string, string>();
  const swap = (id: string) => map.get(id) ?? map.set(id, shortId()).get(id)!;
  const poll = (p: Poll): Poll => ('options' in p ? { ...p, id: swap(p.id), options: p.options.map((o) => ({ ...o, id: swap(o.id) })) } : { ...p, id: swap(p.id) });
  return interactions.map((i) => {
    if (i.type === 'survey') return { ...i, id: swap(i.id), polls: i.polls.map(poll) };
    if (i.type === 'quiz') {
      return { ...i, id: swap(i.id), questions: i.questions.map((q) => ({ ...q, id: swap(q.id), options: q.options.map((o) => ({ ...o, id: swap(o.id) })), correctId: swap(q.correctId) })) };
    }
    return poll(i);
  });
}
