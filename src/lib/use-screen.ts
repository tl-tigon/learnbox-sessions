'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authed } from './auth/client';
import type { PublicQuestion } from './engine/questions';
import { useLive } from './use-live';
import { qaChannel, stateChannel, tallyChannel, type PushEvent } from './push/events';
import type { Session, SessionState, Slide, Tally } from './types';

export interface ScreenView {
  id: string;
  code: string;
  title: string;
  mode: Session['mode'];
  status: 'live' | 'ended';
  state: SessionState;
  slides: Slide[];
  slide: Slide | null;
  people: number;
  tally: Tally | null;
  texts: { text: string; at: string }[];
  /** The current Q&A slide's questions. The owner also gets the ones waiting for approval. */
  questions: PublicQuestion[];
  displayKey?: string;
}

/** A question as it now is, put into a list: replaced, added, or taken out once hidden. */
export function withQuestion(list: PublicQuestion[], q: PublicQuestion): PublicQuestion[] {
  if (q.status === 'hidden') return list.filter((x) => x.id !== q.id);
  return list.some((x) => x.id === q.id) ? list.map((x) => (x.id === q.id ? q : x)) : [...list, q];
}

/**
 * The presenter's view of a session, shared by the big screen and the control view. Signed in as
 * the owner, or with the session's display key (a projector PC that is not signed in).
 */
export function useScreen(id: string, displayKey: string | null) {
  const load = useCallback(async () => {
    const r = displayKey
      ? await fetch(`/api/sessions/${id}`, { headers: { 'x-display-key': displayKey }, cache: 'no-store' })
      : await authed(`/api/sessions/${id}`);
    if (r.status === 401 || r.status === 404) throw new Error(r.status === 401 ? 'Sign in' : 'Not found');
    if (!r.ok) throw new Error('Connection lost');
    return (await r.json()) as ScreenView;
  }, [id, displayKey]);

  const apply = useCallback((cur: ScreenView, e: PushEvent): ScreenView => {
    if (e.kind === 'state') {
      if (e.seq <= cur.state.seq) return cur;
      const slide = cur.slides[e.state.current] ?? null;
      const moved = slide?.id !== cur.slide?.id;
      return { ...cur, status: e.status, state: e.state, slide, tally: moved ? null : cur.tally, texts: moved ? [] : cur.texts, questions: moved ? [] : cur.questions };
    }
    if (e.kind === 'qa' && e.slideId === cur.slide?.id) {
      /* No text: the question is hidden, or waiting for approval (the reload below fetches it for the owner). */
      if (e.q.text === undefined) return e.q.status === 'pending' ? cur : { ...cur, questions: cur.questions.filter((q) => q.id !== e.q.id) };
      return { ...cur, questions: withQuestion(cur.questions, e.q as PublicQuestion) };
    }
    if (e.kind === 'tally' && e.slideId === cur.slide?.id) {
      const texts = e.text ? [...cur.texts, { text: e.text, at: e.at ?? '' }] : cur.texts;
      return { ...cur, tally: e.tally, texts };
    }
    return cur;
  }, []);

  const [channels, setChannels] = useState<string[]>([stateChannel(id)]);
  const reload = useRef<() => void>(() => {});
  const live = useLive<ScreenView>(load, channels, apply, {
    slowMs: 5000,
    onEvent: (e) => {
      if (e.kind === 'qa' && e.q.status === 'pending') reload.current();
    },
  });
  reload.current = () => void live.refresh();
  const slideId = live.data?.slide?.id;
  const isQa = live.data?.slide?.type === 'qa';
  useEffect(() => {
    setChannels(slideId ? [stateChannel(id), isQa ? qaChannel(id, slideId) : tallyChannel(id, slideId)] : [stateChannel(id)]);
  }, [id, slideId, isQa]);
  return live;
}
