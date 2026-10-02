'use client';
/**
 * The live data behind the facilitator's screen and the big screen. Both poll, and apply pushed
 * events as they arrive. There are only a few of these screens per session, so a change of state
 * simply reloads them; the many phones never do that.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { authed } from './auth/client';
import type { PublicQuestion } from './engine/questions';
import type { BoardEntry } from './engine/quiz';
import { useLive } from './use-live';
import { qaChannel, stateChannel, tallyChannel, type ActiveForAudience, type PushEvent } from './push/events';
import type { Interaction, QaSettings, SessionState, Tally } from './types';

interface Shared {
  id: string;
  code: string;
  title: string;
  status: 'live' | 'ended';
  state: SessionState;
  /** The server's clock when this view was made; quiz countdowns run on it. */
  serverNow: number;
  people: number;
  /** Counts of the active poll or quiz question. */
  tally: Tally | null;
  texts: { text: string; at: string }[];
  board: { entries: BoardEntry[]; players: number; final: boolean } | null;
  questions: PublicQuestion[];
}

export interface WallView extends Shared { active: ActiveForAudience | null }
export interface HostView extends Shared {
  closesAt: number;
  createdAt: string;
  displayKey: string;
  /** Rises with each saved edit; an edit is sent with the one it was made from. */
  rev: number;
  qa: QaSettings;
  interactions: Interaction[];
  /** How many have answered each poll and quiz question. */
  answered: Record<string, number>;
}

/** A question as it now is, put into a list: replaced, added, or taken out once hidden. */
export function withQuestion(list: PublicQuestion[], q: PublicQuestion): PublicQuestion[] {
  if (q.status === 'hidden') return list.filter((x) => x.id !== q.id);
  return list.some((x) => x.id === q.id) ? list.map((x) => (x.id === q.id ? q : x)) : [...list, q];
}

/** What every screen does with a pushed event; `countsId` is the poll or quiz question whose counts it shows. */
function applyShared<T extends Shared>(cur: T, e: PushEvent, countsId: string | null): T {
  if (e.kind === 'state') return e.seq <= cur.state.seq ? cur : { ...cur, status: e.status, state: e.state, serverNow: e.now };
  if (e.kind === 'tally') {
    if (e.pollId !== countsId) return cur;
    /* Withheld counts carry only how many answered; the counts on screen stay until the reload that follows. */
    if (e.withheld) return { ...cur, tally: { people: e.tally.people, counts: cur.tally?.counts ?? {} } };
    return { ...cur, tally: e.tally, texts: e.text ? [...cur.texts, { text: e.text, at: e.at ?? '' }] : cur.texts };
  }
  /* No text: the question is hidden, or waiting for review (a reload fetches it for the facilitator). */
  if (e.q.text === undefined) return e.q.status === 'pending' ? cur : { ...cur, questions: cur.questions.filter((q) => q.id !== e.q.id) };
  return { ...cur, questions: withQuestion(cur.questions, { ...(e.q as PublicQuestion), replies: e.q.replies ?? [] }) };
}

function useScreen<T extends Shared>(id: string, load: () => Promise<T>, countsIdOf: (v: T) => string | null, applyMore?: (cur: T, e: PushEvent) => T) {
  const countsRef = useRef<string | null>(null);
  const apply = useCallback((cur: T, e: PushEvent): T => {
    const next = applyShared(cur, e, countsRef.current);
    return applyMore ? applyMore(next, e) : next;
  }, [applyMore]);

  const [channels, setChannels] = useState<string[]>([stateChannel(id), qaChannel(id)]);
  const reload = useRef<() => void>(() => {});
  const waiting = useRef(false);
  const live = useLive<T>(load, channels, apply, {
    slowMs: 5000,
    stale: (cur, next) => next.state.seq < cur.state.seq,
    onEvent: (e) => {
      if (e.kind === 'state' || (e.kind === 'qa' && e.q.status === 'pending') || (e.kind === 'tally' && e.withheld)) reload.current();
    },
  });
  /* Events can come in a burst (a room voting at once), so reloads are spaced out. */
  reload.current = () => {
    if (waiting.current) return;
    waiting.current = true;
    setTimeout(() => {
      waiting.current = false;
      void live.refresh();
    }, 400);
  };

  const countsId = live.data ? countsIdOf(live.data) : null;
  countsRef.current = countsId;
  useEffect(() => {
    setChannels(countsId ? [stateChannel(id), qaChannel(id), tallyChannel(id, countsId)] : [stateChannel(id), qaChannel(id)]);
  }, [id, countsId]);
  return live;
}

/** The big screen: signed in as the owner, or with the session's display key on a projector PC. */
export function useWall(id: string, displayKey: string | null) {
  const load = useCallback(async () => {
    const url = `/api/sessions/${id}?view=wall`;
    const r = displayKey ? await fetch(url, { headers: { 'x-display-key': displayKey }, cache: 'no-store' }) : await authed(url);
    if (r.status === 401 || r.status === 404) throw new Error(r.status === 401 ? 'Sign in' : 'Not found');
    if (!r.ok) throw new Error('Connection lost');
    return (await r.json()) as WallView;
  }, [id, displayKey]);
  const countsIdOf = useCallback((v: WallView) => (v.active?.kind === 'poll' ? v.active.poll.id : v.active?.kind === 'quiz' ? v.active.question?.id ?? null : null), []);
  const applyMore = useCallback((cur: WallView, e: PushEvent): WallView => (e.kind === 'state' && e.seq === cur.state.seq ? { ...cur, active: e.active } : cur), []);
  return useScreen(id, load, countsIdOf, applyMore);
}

/** The facilitator's screen. */
export function useHost(id: string) {
  const load = useCallback(async () => {
    const r = await authed(`/api/sessions/${id}`);
    if (r.status === 401 || r.status === 404) throw new Error(r.status === 401 ? 'Sign in' : 'Not found');
    if (!r.ok) throw new Error('Connection lost');
    return (await r.json()) as HostView;
  }, [id]);
  const countsIdOf = useCallback((v: HostView) => {
    const a = v.interactions.find((i) => i.id === v.state.active);
    if (!a || a.type === 'survey') return null;
    if (a.type !== 'quiz') return a.id;
    const q = v.state.quiz;
    return q && q.quizId === a.id ? a.questions[q.index]?.id ?? null : null;
  }, []);
  const applyMore = useCallback((cur: HostView, e: PushEvent): HostView => (e.kind === 'tally' ? { ...cur, answered: { ...cur.answered, [e.pollId]: e.tally.people } } : cur), []);
  return useScreen(id, load, countsIdOf, applyMore);
}
