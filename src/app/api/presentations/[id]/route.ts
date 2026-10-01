import { store } from '@/lib/store';
import { fail, isResponse, json, readJson, requireUser } from '@/lib/http';
import { LIMITS } from '@/lib/limits';
import { cleanSlides } from '@/lib/engine/slides';
import { cleanText } from '@/lib/engine/words';

type Ctx = { params: Promise<{ id: string }> };

async function owned(req: Request, ctx: Ctx) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  const p = await store().getPresentation((await ctx.params).id);
  /* Someone else's presentation reads as missing, so ids cannot be probed. */
  if (!p || p.ownerSub !== u.sub) return fail(404, 'Not found');
  return p;
}

export async function GET(req: Request, ctx: Ctx) {
  const p = await owned(req, ctx);
  if (isResponse(p)) return p;
  return json({ presentation: p });
}

export async function PUT(req: Request, ctx: Ctx) {
  const p = await owned(req, ctx);
  if (isResponse(p)) return p;
  const body = await readJson(req);
  if (typeof body.title === 'string') p.title = cleanText(body.title).slice(0, LIMITS.titleChars) || 'Untitled';
  if (Array.isArray(body.slides)) p.slides = cleanSlides(body.slides);
  p.updatedAt = new Date().toISOString();
  await store().putPresentation(p);
  return json({ presentation: p });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const p = await owned(req, ctx);
  if (isResponse(p)) return p;
  await store().deletePresentation(p);
  return json({ ok: true });
}
