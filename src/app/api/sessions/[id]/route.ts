import { timingSafeEqual } from 'node:crypto';
import { store } from '@/lib/store';
import { getUser } from '@/lib/auth/server';
import { fail, json, readJson } from '@/lib/http';
import { control, endSession, LiveError, screenView, type ControlAction } from '@/lib/live';
import type { Session } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

const sameKey = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The owner, or (for reading only) a screen holding the session's display key. */
async function load(req: Request, ctx: Ctx, allowKey: boolean): Promise<Session | Response> {
  const s = await store().getSession((await ctx.params).id);
  if (!s) return fail(404, 'Not found');
  const u = await getUser(req);
  if (u?.sub === s.ownerSub) return s;
  const key = req.headers.get('x-display-key') ?? '';
  if (allowKey && key && sameKey(key, s.displayKey)) return s;
  return fail(u ? 404 : 401, u ? 'Not found' : 'Sign in');
}

/** The presenter screen and the control view. */
export async function GET(req: Request, ctx: Ctx) {
  const s = await load(req, ctx, true);
  if (s instanceof Response) return s;
  const view = await screenView(store(), s);
  const owner = !req.headers.get('x-display-key');
  return json({ ...view, ...(owner ? { displayKey: s.displayKey } : {}) });
}

const ACTIONS = new Set(['go', 'next', 'prev', 'results', 'lock']);

/** A presenter control: move, show results, lock answers. */
export async function PATCH(req: Request, ctx: Ctx) {
  const s = await load(req, ctx, false);
  if (s instanceof Response) return s;
  const body = await readJson(req);
  if (!ACTIONS.has(String(body.action))) return fail(400, 'Unknown action');
  try {
    const next = await control(store(), s, body as unknown as ControlAction);
    return json({ state: next.state });
  } catch (e) {
    if (e instanceof LiveError) return fail(e.status, e.message);
    throw e;
  }
}

/** End the session. Its results stay. */
export async function DELETE(req: Request, ctx: Ctx) {
  const s = await load(req, ctx, false);
  if (s instanceof Response) return s;
  if (s.status === 'live') await endSession(store(), s);
  return json({ ok: true });
}
