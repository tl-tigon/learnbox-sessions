import { store } from '@/lib/store';
import { clientIp, fail, json, limited, readJson } from '@/lib/http';
import { isToken } from '@/lib/ids';
import { LIMITS } from '@/lib/limits';
import { audienceView, isClosed } from '@/lib/live';
import { cleanText, isProfane } from '@/lib/engine/words';

type Ctx = { params: Promise<{ id: string }> };

/** What a phone shows. Polled when live push is unavailable. */
export async function GET(req: Request, ctx: Ctx) {
  const db = store();
  const s = await db.getSession((await ctx.params).id);
  if (!s) return fail(404, 'Not found');
  const t = new URL(req.url).searchParams.get('t');
  return json(await audienceView(db, s, isToken(t) ? t : null));
}

/** Join: a phone's token, and a nickname if it gave one. */
export async function POST(req: Request, ctx: Ctx) {
  if (limited(`join:${clientIp(req)}`, 120)) return fail(429, 'Too many tries. Wait a minute.');
  const db = store();
  const s = await db.getSession((await ctx.params).id);
  if (!s) return fail(404, 'Not found');
  if (isClosed(s)) return fail(409, 'This session has ended');
  const body = await readJson(req);
  if (!isToken(body.token)) return fail(400, 'Bad token');
  const nickname = cleanText(String(body.nickname ?? '')).slice(0, LIMITS.nicknameChars);
  if (nickname && isProfane(nickname)) return fail(400, 'Choose another name');
  const r = await db.join(s.id, body.token, nickname, LIMITS.peoplePerSession);
  if (r.full) return fail(409, 'This session is full');
  return json({ ok: true, nickname: r.person?.nickname ?? '' });
}
