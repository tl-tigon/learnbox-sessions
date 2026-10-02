import { timingSafeEqual } from 'node:crypto';
import { getUser } from './auth/server';
import { fail } from './http';
import { store } from './store';
import type { Session } from './types';

const sameKey = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * The session, for its owner. Someone else's session reads as missing, so ids cannot be probed.
 * With `allowKey`, a screen holding the session's display key may also read it.
 */
export async function ownedSession(req: Request, id: string, allowKey = false): Promise<Session | Response> {
  const s = await store().getSession(id);
  const u = await getUser(req);
  if (s && u?.sub === s.ownerSub) return s;
  const key = req.headers.get('x-display-key') ?? '';
  if (s && allowKey && key && sameKey(key, s.displayKey)) return s;
  return u ? fail(404, 'Not found') : fail(401, 'Sign in');
}
