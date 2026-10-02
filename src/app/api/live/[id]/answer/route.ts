import { store } from '@/lib/store';
import { fail, json, limited, readJson } from '@/lib/http';
import { isToken } from '@/lib/ids';
import { LiveError, respond, respondQuiz, respondSurvey } from '@/lib/live';

type Ctx = { params: Promise<{ id: string }> };

/**
 * An answer to whatever the facilitator has started: `pollId` with `answer` for a poll or a quiz
 * question, or `surveyId` with `answers` for a whole survey.
 */
export async function POST(req: Request, ctx: Ctx) {
  const body = await readJson(req);
  if (!isToken(body.token)) return fail(400, 'Bad token');
  if (limited(`ans:${body.token}`, 60)) return fail(429, 'Too many answers. Wait a minute.');
  const db = store();
  const s = await db.getSession((await ctx.params).id);
  if (!s) return fail(404, 'Not found');
  try {
    if (typeof body.surveyId === 'string') {
      return json({ ok: true, ...(await respondSurvey(db, s, body.token, body.surveyId, body.answers)) });
    }
    const pollId = String(body.pollId ?? '');
    const quiz = s.interactions.find((i) => i.id === s.state.active)?.type === 'quiz';
    const r = quiz ? await respondQuiz(db, s, body.token, pollId, body.answer) : await respond(db, s, body.token, pollId, body.answer);
    /* A phone gets the counts back only when results are being shown; a quiz never returns them here. */
    return json({ ok: true, entries: r.entries, done: r.done, tally: !quiz && s.state.showResults ? r.tally : null });
  } catch (e) {
    if (e instanceof LiveError) return fail(e.status, e.message);
    throw e;
  }
}
