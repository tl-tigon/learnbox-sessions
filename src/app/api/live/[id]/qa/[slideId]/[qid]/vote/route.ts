import { store } from '@/lib/store';
import { fail, json, limited, readJson } from '@/lib/http';
import { isToken } from '@/lib/ids';
import { LiveError } from '@/lib/live';
import { upvote } from '@/lib/qa';

type Ctx = { params: Promise<{ id: string; slideId: string; qid: string }> };

/** Upvote a question: one vote per person. */
export async function POST(req: Request, ctx: Ctx) {
  const { id, slideId, qid } = await ctx.params;
  const body = await readJson(req);
  if (!isToken(body.token)) return fail(400, 'Bad token');
  if (limited(`vote:${body.token}`, 120)) return fail(429, 'Too many votes. Wait a minute.');
  const db = store();
  const s = await db.getSession(id);
  if (!s) return fail(404, 'Not found');
  try {
    const q = await upvote(db, s, body.token, slideId, qid);
    return json({ votes: q.votes });
  } catch (e) {
    if (e instanceof LiveError) return fail(e.status, e.message);
    throw e;
  }
}
