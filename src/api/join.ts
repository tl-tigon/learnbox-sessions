import { store } from '@/lib/store';
import { blocked, clientIp, fail, json, limited } from '@/lib/http';
import { isCode } from '@/lib/ids';
import { canJoin } from '@/lib/live';

type Ctx = { params: Promise<{ code: string }> };

/** Which session a code belongs to: a live one, or an ended one whose feedback form is still open. */
export async function GET(req: Request, ctx: Ctx) {
  /* Codes are only six digits, so guessing is throttled hard per address. Only wrong codes count:
     a whole room behind one address, all entering the right code, is never held back. */
  const key = `code:${clientIp(req)}`;
  if (blocked(key, 30)) return fail(429, 'Too many tries. Wait a minute.');
  const miss = () => {
    limited(key, 30);
    return fail(404, 'No session with that code');
  };
  const code = (await ctx.params).code;
  if (!isCode(code)) return miss();
  const db = store();
  const id = await db.sessionIdForCode(code);
  const s = id ? await db.getSession(id) : null;
  if (!s || !canJoin(s)) return miss();
  return json({ id: s.id, title: s.title });
}
