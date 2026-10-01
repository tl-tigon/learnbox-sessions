import { store } from '@/lib/store';
import { isResponse, json, requireUser } from '@/lib/http';

export async function GET(req: Request) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  const now = Date.now() / 1000;
  const sessions = (await store().listSessions(u.sub)).map((s) => ({ ...s, status: s.status === 'live' && s.closesAt < now ? 'ended' : s.status }));
  return json({ sessions });
}
