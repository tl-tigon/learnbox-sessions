import { store } from '@/lib/store';
import { siteOrigin, startOrder } from '@/lib/billing';
import { fail, isResponse, json, limited, readJson, requireUser } from '@/lib/http';
import { LiveError } from '@/lib/live';

/** Starts a payment for Pro: the form the browser posts to the payment page. */
export async function POST(req: Request) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  if (limited(`pay:${u.sub}`, 10)) return fail(429, 'Too many tries. Wait a minute.');
  try {
    return json(await startOrder(store(), u, await readJson(req), siteOrigin(req)));
  } catch (e) {
    if (e instanceof LiveError) return fail(e.status, e.message);
    throw e;
  }
}
