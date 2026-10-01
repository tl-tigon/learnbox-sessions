import { NextResponse } from 'next/server';
import { getUser, type User } from './auth/server';

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
export const fail = (status: number, error: string) => json({ error }, status);

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** The signed-in facilitator, or a 401 response to return. */
export async function requireUser(req: Request): Promise<User | Response> {
  const u = await getUser(req);
  return u ?? fail(401, 'Sign in');
}
export const isResponse = (v: unknown): v is Response => v instanceof Response;

/**
 * A simple per-key rate limit kept in this server's memory. It stops a single runaway phone or
 * script; it is not shared between server instances, which is acceptable for a guard like this.
 */
const hits = new Map<string, { n: number; reset: number }>();
export function limited(key: string, perMinute: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + 60_000 });
    if (hits.size > 50_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return false;
  }
  h.n += 1;
  return h.n > perMinute;
}

export const clientIp = (req: Request) =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
