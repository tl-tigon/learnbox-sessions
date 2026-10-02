'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { onPushStatus, pushConfigured, subscribe } from './push/client';
import type { PushEvent } from './push/events';

/**
 * Data that changes while a session runs. Loaded by polling; when live push is up, pushed events
 * are applied straight away and polling slows to a slow safety check.
 */
export function useLive<T>(
  load: () => Promise<T | null>,
  channels: string[],
  apply: (cur: T, e: PushEvent) => T,
  opts: { fastMs?: number; slowMs?: number; enabled?: boolean; onEvent?: (e: PushEvent) => void } = {},
) {
  const { fastMs = 1500, slowMs = 15000, enabled = true } = opts;
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushUp, setPushUp] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const refresh = useCallback(async () => {
    try {
      const v = await loadRef.current();
      if (v) {
        setData(v);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection lost');
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === 'visible') await refresh();
      timer = setTimeout(tick, pushUp ? slowMs : fastMs);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [enabled, refresh, pushUp, fastMs, slowMs]);

  const key = channels.join('|');
  useEffect(() => {
    if (!enabled || !pushConfigured()) return;
    const offStatus = onPushStatus(setPushUp);
    const offs = key
      .split('|')
      .filter(Boolean)
      .map((c) => subscribe(c, (e) => {
        setData((cur) => (cur ? applyRef.current(cur, e) : cur));
        onEventRef.current?.(e);
      }));
    return () => {
      offStatus();
      offs.forEach((o) => o?.());
      setPushUp(false);
    };
  }, [enabled, key]);

  return { data, setData, error, refresh, pushUp };
}
