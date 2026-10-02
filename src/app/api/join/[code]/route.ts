import { store } from '@/lib/store';
import { clientIp, fail, json, limited } from '@/lib/http';
import { isCode } from '@/lib/ids';
import { isClosed, needsName } from '@/lib/live';

type Ctx = { params: Promise<{ code: string }> };

/** Which live session a code belongs to. */
export async function GET(req: Request, ctx: Ctx) {
  /* Codes are only six digits, so guessing is throttled hard per address. */
  if (limited(`code:${clientIp(req)}`, 30)) return fail(429, 'Too many tries. Wait a minute.');
  const code = (await ctx.params).code;
  if (!isCode(code)) return fail(404, 'No session with that code');
  const db = store();
  const id = await db.sessionIdForCode(code);
  const s = id ? await db.getSession(id) : null;
  if (!s || isClosed(s)) return fail(404, 'No session with that code');
  return json({ id: s.id, title: s.title, mode: s.mode, needsName: needsName(s) });
}
