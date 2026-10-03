import { store } from '@/lib/store';
import { fail, json, readJson } from '@/lib/http';
import { aiUsage, debrief, followUp } from '@/lib/ai';
import { AiError } from '@/lib/ai/claude';
import { devAuth } from '@/lib/auth/server';
import { LiveError } from '@/lib/live';
import { ownedSession } from '@/lib/owner';

type Ctx = { params: Promise<{ id: string }> };

/** The saved debrief of an interaction (`?interaction=`), and what the account has used of its month's AI allowance. */
export async function GET(req: Request, ctx: Ctx) {
  const s = await ownedSession(req, (await ctx.params).id);
  if (s instanceof Response) return s;
  const db = store();
  const interactionId = new URL(req.url).searchParams.get('interaction') ?? '';
  return json({ debrief: interactionId ? await db.getDebrief(s.id, interactionId) : null, usage: await aiUsage(db, s.ownerSub) });
}

/**
 * Generates: `{feature: 'debrief', interactionId, again?}` or `{feature: 'follow-up', interactionId, mode}`.
 * The model's key never leaves the server; the browser gets the text and nothing else.
 */
export async function POST(req: Request, ctx: Ctx) {
  const s = await ownedSession(req, (await ctx.params).id);
  if (s instanceof Response) return s;
  const body = await readJson(req);
  /* In development, a request may ask the stand-in to fail, so the screens' failure path can be walked. */
  const failNow = devAuth() && req.headers.get('x-ai-test') === 'fail';
  try {
    if (body.feature === 'debrief') return json(await debrief(store(), s, body.interactionId, body.again === true, failNow));
    if (body.feature === 'follow-up') return json(await followUp(store(), s, body.interactionId, body.mode, failNow));
    return fail(400, 'Unknown feature');
  } catch (e) {
    if (e instanceof LiveError || e instanceof AiError) return fail(e.status, e.message);
    throw e;
  }
}
