import { store } from '@/lib/store';
import { fail, json, readJson } from '@/lib/http';
import { control, CONTROL_ACTIONS, editSession, endSession, hostView, LiveError, resetInteraction, wallView, type ControlAction } from '@/lib/live';
import { ownedSession } from '@/lib/owner';

type Ctx = { params: Promise<{ id: string }> };

const failed = (e: unknown) => {
  if (e instanceof LiveError) return fail(e.status, e.message);
  throw e;
};

/**
 * The facilitator's screen, or with `?view=wall` the big screen. The wall carries only what the
 * audience may see, so a projector holding the display key can read it without being signed in.
 */
export async function GET(req: Request, ctx: Ctx) {
  const query = new URL(req.url).searchParams;
  const wall = query.get('view') === 'wall';
  const s = await ownedSession(req, (await ctx.params).id, wall);
  if (s instanceof Response) return s;
  return json(wall ? await wallView(store(), s) : await hostView(store(), s, query.get('show')));
}

/** The facilitator's edits: title, interactions, Q&A settings. */
export async function PUT(req: Request, ctx: Ctx) {
  const s = await ownedSession(req, (await ctx.params).id);
  if (s instanceof Response) return s;
  try {
    const saved = await editSession(store(), s, await readJson(req));
    return json({ title: saved.title, interactions: saved.interactions, qa: saved.qa, state: saved.state, rev: saved.rev ?? 1 });
  } catch (e) {
    return failed(e);
  }
}

/** A control: start or stop an interaction, show results, lock voting, open Q&A, announce, quiz steps, reset an interaction's results, end. */
export async function PATCH(req: Request, ctx: Ctx) {
  const s = await ownedSession(req, (await ctx.params).id);
  if (s instanceof Response) return s;
  const body = await readJson(req);
  try {
    if (body.action === 'end') {
      if (s.status === 'live') await endSession(store(), s);
      return json({ ok: true });
    }
    if (body.action === 'reset') return json({ state: (await resetInteraction(store(), s, body.id)).state });
    if (!CONTROL_ACTIONS.includes(String(body.action))) return fail(400, 'Unknown action');
    const next = await control(store(), s, body as unknown as ControlAction);
    return json({ state: next.state });
  } catch (e) {
    return failed(e);
  }
}

/** Deletes the session and everything recorded in it. */
export async function DELETE(req: Request, ctx: Ctx) {
  const s = await ownedSession(req, (await ctx.params).id);
  if (s instanceof Response) return s;
  await store().deleteSession(s);
  return json({ ok: true });
}
