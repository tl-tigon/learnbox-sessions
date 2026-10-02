import { store } from '@/lib/store';
import { fail, json, readJson } from '@/lib/http';
import { LiveError } from '@/lib/live';
import { ownedSession } from '@/lib/owner';
import { moderate, MODERATE_ACTIONS, type ModerateAction } from '@/lib/qa';
import { publicQuestion } from '@/lib/engine/questions';

type Ctx = { params: Promise<{ id: string; qid: string }> };

/** The facilitator's action on one question: approve, hide, mark answered, highlight, reply. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id, qid } = await ctx.params;
  const s = await ownedSession(req, id);
  if (s instanceof Response) return s;
  const body = await readJson(req);
  const action = String(body.action) as ModerateAction;
  if (!MODERATE_ACTIONS.includes(action)) return fail(400, 'Unknown action');
  try {
    const r = await moderate(store(), s, qid, action, body.text);
    return json({ question: publicQuestion(r.question), state: r.session.state });
  } catch (e) {
    if (e instanceof LiveError) return fail(e.status, e.message);
    throw e;
  }
}
