import { store } from '@/lib/store';
import { fail, json } from '@/lib/http';
import { sessionResults } from '@/lib/live';
import { ownedSession } from '@/lib/owner';
import { resultsCsv, resultsXlsx } from '@/lib/export';
import { planOf } from '@/lib/plans';

type Ctx = { params: Promise<{ id: string }> };

/** A session's results: as JSON for the results page, or with `?format=` as a CSV or Excel file, which is on Pro. */
export async function GET(req: Request, ctx: Ctx) {
  const s = await ownedSession(req, (await ctx.params).id);
  if (s instanceof Response) return s;
  const format = new URL(req.url).searchParams.get('format');
  const { downloads } = await planOf(store(), s.ownerSub);
  if ((format === 'csv' || format === 'xlsx') && !downloads) return fail(402, 'Downloads are on Pro');
  const results = await sessionResults(store(), s);
  const name = `${s.title.replace(/[^\w -]/g, '').trim() || 'results'} ${s.createdAt.slice(0, 10)}`;
  if (format === 'csv') {
    return new Response(resultsCsv(results), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"`, 'cache-control': 'no-store' },
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
  return json({ ...results, downloads });
}
