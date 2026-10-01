'use client';
import { useCallback, useEffect, useState } from 'react';
import { authed } from './auth/client';
import { useLive } from './use-live';
import { stateChannel, tallyChannel, type PushEvent } from './push/events';
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
  displayKey?: string;
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
      return { ...cur, status: e.status, state: e.state, slide, tally: moved ? null : cur.tally, texts: moved ? [] : cur.texts };
    }
    if (e.kind === 'tally' && e.slideId === cur.slide?.id) {
      const texts = e.text ? [...cur.texts, { text: e.text, at: e.at ?? '' }] : cur.texts;
      return { ...cur, tally: e.tally, texts };
    }
    return cur;
  }, []);

  const [channels, setChannels] = useState<string[]>([stateChannel(id)]);
  const live = useLive<ScreenView>(load, channels, apply, { slowMs: 5000 });
  const slideId = live.data?.slide?.id;
  useEffect(() => {
    setChannels(slideId ? [stateChannel(id), tallyChannel(id, slideId)] : [stateChannel(id)]);
  }, [id, slideId]);
  return live;
}
