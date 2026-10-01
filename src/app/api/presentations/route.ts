import { store } from '@/lib/store';
import { fail, isResponse, json, readJson, requireUser } from '@/lib/http';
import { newId } from '@/lib/ids';
import { LIMITS } from '@/lib/limits';
import { blankSlide, cleanSlides } from '@/lib/engine/slides';
import { cleanText } from '@/lib/engine/words';

export async function GET(req: Request) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  return json({ presentations: await store().listPresentations(u.sub) });
}

export async function POST(req: Request) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  const db = store();
  const mine = await db.listPresentations(u.sub);
  if (mine.length >= LIMITS.presentationsPerAccount) {
    return fail(409, `Up to ${LIMITS.presentationsPerAccount} presentations per account. Delete one to make another.`);
  }
  const body = await readJson(req);
  const now = new Date().toISOString();
  const slides = body.slides ? cleanSlides(body.slides) : [blankSlide('choice')];
  const p = {
    id: newId(),
    ownerSub: u.sub,
    title: cleanText(String(body.title ?? '')).slice(0, LIMITS.titleChars) || 'Untitled',
    slides,
    createdAt: now,
    updatedAt: now,
  };
  await db.putPresentation(p);
  return json({ presentation: p }, 201);
}
