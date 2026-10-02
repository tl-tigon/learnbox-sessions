import { store } from '@/lib/store';
import { fail, json, limited, readJson } from '@/lib/http';
import { isToken } from '@/lib/ids';
import { LiveError } from '@/lib/live';
import { withdraw } from '@/lib/qa';

type Ctx = { params: Promise<{ id: string; qid: string }> };

/** Take back a question: only the person who asked it can. */
export async function POST(req: Request, ctx: Ctx) {
  const { id, qid } = await ctx.params;
  const body = await readJson(req);
  if (!isToken(body.token)) return fail(400, 'Bad token');
  if (limited(`ask:${body.token}`, 12)) return fail(429, 'Too many tries. Wait a minute.');
  const db = store();
  const s = await db.getSession(id);
  if (!s) return fail(404, 'Not found');
  try {
    await withdraw(db, s, body.token, qid);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof LiveError) return fail(e.status, e.message);
    throw e;
  }
}
