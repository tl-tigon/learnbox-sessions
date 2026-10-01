import { store } from '@/lib/store';
import { fail, isResponse, json, readJson, requireUser } from '@/lib/http';
import { LiveError, startSession } from '@/lib/live';

type Ctx = { params: Promise<{ id: string }> };

/** Start a session from a presentation. */
export async function POST(req: Request, ctx: Ctx) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  const db = store();
  const p = await db.getPresentation((await ctx.params).id);
  if (!p || p.ownerSub !== u.sub) return fail(404, 'Not found');
  const body = await readJson(req);
  try {
    const s = await startSession(db, u.sub, p, body.mode === 'survey' ? 'survey' : 'presenter');
    return json({ session: { id: s.id, code: s.code, displayKey: s.displayKey } }, 201);
  } catch (e) {
    if (e instanceof LiveError) return fail(e.status, e.message);
    throw e;
  }
}
