import { store } from '@/lib/store';
import { fail, isResponse, json, readJson, requireUser } from '@/lib/http';
import { createSession, duplicateSession, LiveError } from '@/lib/live';

/** The facilitator's sessions, newest first. */
export async function GET(req: Request) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  const now = Date.now() / 1000;
  const sessions = (await store().listSessions(u.sub)).map((s) => ({ ...s, status: s.status === 'live' && s.closesAt < now ? 'ended' : s.status }));
  return json({ sessions });
}

/** A new session, or with `from`, a copy of one of the facilitator's own. */
export async function POST(req: Request) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  const db = store();
  const body = await readJson(req);
  try {
    if (typeof body.from === 'string') {
      const source = await db.getSession(body.from);
      if (!source || source.ownerSub !== u.sub) return fail(404, 'Not found');
      const s = await duplicateSession(db, u.sub, source);
      return json({ session: { id: s.id, code: s.code } }, 201);
    }
    const s = await createSession(db, u.sub, body.title);
    return json({ session: { id: s.id, code: s.code } }, 201);
  } catch (e) {
    if (e instanceof LiveError) return fail(e.status, e.message);
    throw e;
  }
}
