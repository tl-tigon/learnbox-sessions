import { store } from '@/lib/store';
import { fail, json, limited, readJson } from '@/lib/http';
import { isToken } from '@/lib/ids';
import { LiveError } from '@/lib/live';
import { ask, audienceQuestions } from '@/lib/qa';
import { publicQuestion } from '@/lib/engine/questions';

type Ctx = { params: Promise<{ id: string }> };

/** The questions a phone lists. Polled when live push is unavailable. */
export async function GET(req: Request, ctx: Ctx) {
  const db = store();
  const s = await db.getSession((await ctx.params).id);
  if (!s) return fail(404, 'Not found');
  const t = new URL(req.url).searchParams.get('t');
  return json({ questions: await audienceQuestions(db, s, isToken(t) ? t : null) });
}

/** Ask a question. */
export async function POST(req: Request, ctx: Ctx) {
  const body = await readJson(req);
  if (!isToken(body.token)) return fail(400, 'Bad token');
  if (limited(`ask:${body.token}`, 12)) return fail(429, 'Too many questions. Wait a minute.');
  const db = store();
  const s = await db.getSession((await ctx.params).id);
  if (!s) return fail(404, 'Not found');
  try {
    const q = await ask(db, s, body.token, body);
    return json({ question: { ...publicQuestion(q), mine: true, voted: false } }, 201);
  } catch (e) {
    if (e instanceof LiveError) return fail(e.status, e.message);
    throw e;
  }
}
