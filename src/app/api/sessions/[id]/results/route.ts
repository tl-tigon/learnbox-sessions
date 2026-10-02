import { store } from '@/lib/store';
import { fail, isResponse, json, requireUser } from '@/lib/http';
import { sessionResults } from '@/lib/live';
import { resultsCsv, resultsXlsx } from '@/lib/export';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  const db = store();
  const s = await db.getSession((await ctx.params).id);
  if (!s || s.ownerSub !== u.sub) return fail(404, 'Not found');
  const results = await sessionResults(db, s);
  const format = new URL(req.url).searchParams.get('format');
  const name = `${s.title.replace(/[^\w -]/g, '').trim() || 'results'} ${s.createdAt.slice(0, 10)}`;
  if (format === 'csv') {
    return new Response(resultsCsv(results), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${name}.csv"`,
        'cache-control': 'no-store',
      },
    });
  }
  if (format === 'xlsx') {
    return new Response(await resultsXlsx(results), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${name}.xlsx"`,
        'cache-control': 'no-store',
      },
    });
  }
  return json(results);
}
