import { timingSafeEqual } from 'node:crypto';
import { getUser } from './auth/server';
import { fail } from './http';
import { store } from './store';
import type { Session } from './types';

/** Compared as bytes, in constant time. Lengths are compared as bytes too, since a non-ASCII character is more than one. */
function sameKey(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

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
