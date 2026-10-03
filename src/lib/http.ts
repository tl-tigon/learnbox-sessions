import { getUser, type User } from './auth/server';

/* Plain web responses, so the same handlers run under Next.js in development and in Lambda in production. */
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
/** Sends the browser to another address with a GET, as after a posted form. */
export const seeOther = (url: string) => new Response(null, { status: 303, headers: { location: url, 'cache-control': 'no-store' } });
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

/** True if this key is already over its limit. It counts nothing itself; `limited` does the counting. */
export function blocked(key: string, perMinute: number): boolean {
  const h = hits.get(key);
  return !!h && h.reset >= Date.now() && h.n >= perMinute;
}

/**
 * The caller's address, for rate limits. Behind the CDN, the Lambda adapter sets `x-client-ip`
 * from what the CDN saw (and strips any the caller sent). Otherwise a proxy appends the address
 * it saw to the end of X-Forwarded-For, and everything before that is whatever the caller sent,
 * so the last entry is the one to trust.
 */
export const clientIp = (req: Request) =>
  req.headers.get('x-client-ip') || (req.headers.get('x-forwarded-for') ?? '').split(',').pop()!.trim() || req.headers.get('x-real-ip') || 'unknown';
