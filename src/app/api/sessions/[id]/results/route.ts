import { store } from '@/lib/store';
import { fail, isResponse, json, requireUser } from '@/lib/http';
import { sessionResults } from '@/lib/live';
import { resultsCsv } from '@/lib/export';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  const db = store();
  const s = await db.getSession((await ctx.params).id);
  if (!s || s.ownerSub !== u.sub) return fail(404, 'Not found');
  const results = await sessionResults(db, s);
  if (new URL(req.url).searchParams.get('format') === 'csv') {
    const name = `${s.title.replace(/[^\w -]/g, '').trim() || 'results'} ${s.createdAt.slice(0, 10)}.csv`;
    return new Response(resultsCsv(results), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${name}"`,
        'cache-control': 'no-store',
      },
    });
  }
  return json(results);
}
