/**
 * The API's routes: each path, the handlers for its methods, and the group it is deployed in.
 * The same tables serve development, where Next.js hands every `/api` and `/j` request to
 * `dispatch`, and production, where each group is one Lambda behind API Gateway (`lambda/`).
 *
 * Groups (`routes/`): `audience` is what phones call, open to anyone and the busiest; `host` is
 * the facilitator's, behind a sign-in; `billing` holds the payment routes and the only code that
 * sees the PayU salt. Each group is bundled and runs on its own, so a flood on one cannot slow
 * the others, and each carries only its own code.
 */
import { fail } from '@/lib/http';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export type Group = 'audience' | 'host' | 'billing';
/* Handlers take the params of their own path, so the table holds them loosely typed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handler = (req: Request, ctx: { params: Promise<any> }) => Promise<Response> | Response;
export interface Route { path: string; group: Group; handlers: Partial<Record<Method, Handler>> }

/** The methods a route answers, as API Gateway lists them. */
export const methodsOf = (r: Route) => METHODS.filter((m) => r.handlers[m]);

/** Matches a path against a route's pattern: `{name}` takes one segment. */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const want = pattern.split('/'), got = pathname.split('/');
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const w = want[i];
    if (w.startsWith('{') && w.endsWith('}')) {
      if (!got[i]) return null;
      try {
        params[w.slice(1, -1)] = decodeURIComponent(got[i]);
      } catch {
        return null;
      }
    } else if (w !== got[i]) return null;
  }
  return params;
}

/** Runs the handler for a request. Unknown paths are 404 and unsupported methods 405. */
export async function dispatch(req: Request, routes: Route[]): Promise<Response> {
  const pathname = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
  for (const r of routes) {
    const params = matchPath(r.path, pathname);
    if (!params) continue;
    const handler = r.handlers[req.method as Method];
    if (!handler) return fail(405, 'Method not allowed');
    return handler(req, { params: Promise.resolve(params) });
  }
  return fail(404, 'Not found');
}
