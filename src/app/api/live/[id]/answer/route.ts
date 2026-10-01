import { store } from '@/lib/store';
import { fail, json, limited, readJson } from '@/lib/http';
import { isToken } from '@/lib/ids';
import { LiveError, respond } from '@/lib/live';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const body = await readJson(req);
  if (!isToken(body.token)) return fail(400, 'Bad token');
  if (limited(`ans:${body.token}`, 60)) return fail(429, 'Too many answers. Wait a minute.');
  const db = store();
  const s = await db.getSession((await ctx.params).id);
  if (!s) return fail(404, 'Not found');
  try {
    const r = await respond(db, s, body.token, String(body.slideId ?? ''), body.answer);
    return json({ ok: true, entries: r.entries, done: r.done, tally: s.state.showResults || s.mode === 'survey' ? r.tally : null });
  } catch (e) {
    if (e instanceof LiveError) return fail(e.status, e.message);
    throw e;
  }
}
