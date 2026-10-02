import { store } from '@/lib/store';
import { fail, isResponse, json, readJson, requireUser } from '@/lib/http';
import { LiveError } from '@/lib/live';
import { moderate, MODERATE_ACTIONS, type ModerateAction } from '@/lib/qa';
import { publicQuestion } from '@/lib/engine/questions';

type Ctx = { params: Promise<{ id: string; slideId: string; qid: string }> };

/** The facilitator's action on one question: approve, hide, mark answered, highlight. */
export async function PATCH(req: Request, ctx: Ctx) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  const { id, slideId, qid } = await ctx.params;
  const db = store();
  const s = await db.getSession(id);
  if (!s || s.ownerSub !== u.sub) return fail(404, 'Not found');
  const action = String((await readJson(req)).action) as ModerateAction;
  if (!MODERATE_ACTIONS.includes(action)) return fail(400, 'Unknown action');
  try {
    const r = await moderate(db, s, slideId, qid, action);
    return json({ question: publicQuestion(r.question), state: r.session.state });
  } catch (e) {
    if (e instanceof LiveError) return fail(e.status, e.message);
    throw e;
  }
}
