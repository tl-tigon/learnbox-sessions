'use client';
/**
 * Subscribing to AppSync Events from the browser. One WebSocket per page, shared by every
 * subscription on it. Returns null from `subscribe` when push is not configured; callers then poll.
 *
 * Protocol: https://docs.aws.amazon.com/appsync/latest/eventapi/event-api-websocket-protocol.html
 */
import type { PushEvent } from './events';

const HTTP = process.env.NEXT_PUBLIC_EVENTS_HTTP_DOMAIN;
const RT = process.env.NEXT_PUBLIC_EVENTS_REALTIME_DOMAIN;
const KEY = process.env.NEXT_PUBLIC_EVENTS_API_KEY;

export const pushConfigured = () => !!(HTTP && RT && KEY);

type Handler = (e: PushEvent) => void;
interface Sub { channel: string; handler: Handler; acked: boolean }

const auth = () => ({ host: HTTP!, 'x-api-key': KEY! });
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let ws: WebSocket | null = null;
let ready = false;
let retry = 0;
const subs = new Map<string, Sub>();
const listeners = new Set<(up: boolean) => void>();
const setUp = (up: boolean) => listeners.forEach((l) => l(up));

function send(msg: unknown) {
  if (ws && ready) ws.send(JSON.stringify(msg));
}
function sendSubscribe(id: string, s: Sub) {
  send({ type: 'subscribe', id, channel: s.channel, authorization: auth() });
}

function connect() {
  if (ws || !pushConfigured()) return;
  const header = b64url(JSON.stringify(auth()));
  ws = new WebSocket(`wss://${RT}/event/realtime`, ['aws-appsync-event-ws', `header-${header}`]);
  let keepalive: ReturnType<typeof setTimeout> | null = null;
  let timeoutMs = 300_000;
  const arm = () => {
    if (keepalive) clearTimeout(keepalive);
    keepalive = setTimeout(() => ws?.close(), timeoutMs);
  };
  ws.onopen = () => ws?.send(JSON.stringify({ type: 'connection_init' }));
  ws.onmessage = (m) => {
    let msg: { type: string; id?: string; event?: string; connectionTimeoutMs?: number };
    try {
      msg = JSON.parse(String(m.data));
    } catch {
      return;
    }
    arm();
    if (msg.type === 'connection_ack') {
      ready = true;
      retry = 0;
      timeoutMs = msg.connectionTimeoutMs ?? timeoutMs;
      subs.forEach((s, id) => sendSubscribe(id, s));
    } else if (msg.type === 'subscribe_success' && msg.id) {
      const s = subs.get(msg.id);
      if (s) s.acked = true;
      if ([...subs.values()].every((x) => x.acked)) setUp(true);
    } else if (msg.type === 'data' && msg.id) {
      const s = subs.get(msg.id);
      if (!s || !msg.event) return;
      try {
        s.handler(JSON.parse(msg.event));
      } catch {
        /* a malformed event is skipped; the next one or a poll catches up */
      }
    }
  };
  ws.onclose = () => {
    if (keepalive) clearTimeout(keepalive);
    ws = null;
    ready = false;
    subs.forEach((s) => (s.acked = false));
    setUp(false);
    if (subs.size) setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
  };
}

/** Listen on a channel. Returns an unsubscribe function, or null when push is unavailable. */
export function subscribe(channel: string, handler: Handler): (() => void) | null {
  if (!pushConfigured() || typeof window === 'undefined') return null;
  const id = crypto.randomUUID();
  const s: Sub = { channel, handler, acked: false };
  subs.set(id, s);
  if (ready) sendSubscribe(id, s);
  else connect();
  return () => {
    subs.delete(id);
    send({ type: 'unsubscribe', id });
    if (!subs.size) ws?.close();
  };
}

/** Told when push is fully up (true) or down (false), so pages can poll more or less often. */
export function onPushStatus(l: (up: boolean) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
