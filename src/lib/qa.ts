/**
 * Q&A on a session: asking, upvoting, and the facilitator's moderation. Each change is stored,
 * then pushed on the slide's Q&A channel. The highlighted question lives in the session state,
 * so it travels with slide moves.
 */
import { checkQuestion, isShown, publicQuestion, type PublicQuestion } from './engine/questions';
import { newId } from './ids';
import { LIMITS } from './limits';
import { control, isClosed, LiveError } from './live';
import { publish } from './push/server';
import { qaChannel, type QuestionEvent } from './push/events';
import type { Store } from './store/types';
import type { QaSlide, Question, Session } from './types';

function qaSlide(s: Session, slideId: string): QaSlide {
  const slide = s.slides.find((x) => x.id === slideId);
  if (!slide || slide.type !== 'qa') throw new LiveError(400, 'This slide takes no questions');
  return slide;
}

/** The slide, once the session, the presenter and the person all allow a question or a vote. */
async function openSlide(db: Store, s: Session, token: string, slideId: string) {
  if (isClosed(s)) throw new LiveError(409, 'This session has ended');
  const slide = qaSlide(s, slideId);
  if (s.mode === 'presenter') {
    if (s.slides[s.state.current]?.id !== slideId) throw new LiveError(409, 'The presenter has moved on');
    if (s.state.locked) throw new LiveError(409, 'Questions are closed');
  }
  const person = await db.getPerson(s.id, token);
  if (!person) throw new LiveError(403, 'Join the session first');
  return { slide, person };
}

const eventOf = (q: Question): QuestionEvent => (isShown(q.status) ? publicQuestion(q) : { id: q.id, status: q.status });
const announce = (s: Session, q: Question) => publish(qaChannel(s.id, q.slideId), { kind: 'qa', slideId: q.slideId, q: eventOf(q) });

export async function ask(db: Store, s: Session, token: string, slideId: string, raw: unknown): Promise<Question> {
  const { slide, person } = await openSlide(db, s, token, slideId);
  const c = checkQuestion(slide, raw, person.nickname);
  if (!c.ok) throw new LiveError(400, c.error);

  const all = await db.listQuestions(s.id, slideId);
  if (all.length >= LIMITS.questionsPerSlide) throw new LiveError(409, `Up to ${LIMITS.questionsPerSlide} questions per slide`);
  if (all.filter((q) => q.token === token).length >= LIMITS.questionsPerPerson) throw new LiveError(409, 'You have asked the most allowed');

  /* A name given with the question becomes the person's name for the session. */
  if (c.name && c.name !== person.nickname) await db.join(s.id, token, c.name, LIMITS.peoplePerSession);

  const q: Question = {
    id: newId(),
    slideId,
    token,
    text: c.text,
    name: c.name,
    status: slide.moderation ? 'pending' : 'live',
    votes: 0,
    at: new Date().toISOString(),
  };
  await db.addQuestion(s.id, q);
  await announce(s, q);
  return q;
}

export async function upvote(db: Store, s: Session, token: string, slideId: string, id: string): Promise<Question> {
  await openSlide(db, s, token, slideId);
  const q = await db.getQuestion(s.id, slideId, id);
  if (!q || q.status === 'pending' || q.status === 'hidden') throw new LiveError(404, 'Not found');
  if (q.status !== 'live') throw new LiveError(409, 'This question is answered');
  const voted = await db.upvote(s.id, slideId, id, token);
  if (!voted) throw new LiveError(409, 'You have already voted');
  await announce(s, voted);
  return voted;
}

export type ModerateAction = 'approve' | 'hide' | 'answered' | 'highlight' | 'unhighlight';
export const MODERATE_ACTIONS: ModerateAction[] = ['approve', 'hide', 'answered', 'highlight', 'unhighlight'];

/** The facilitator's actions on one question. Returns the session, whose state holds the highlight. */
export async function moderate(db: Store, s: Session, slideId: string, id: string, action: ModerateAction): Promise<{ question: Question; session: Session }> {
  if (isClosed(s)) throw new LiveError(409, 'This session has ended');
  qaSlide(s, slideId);
  const q = await db.getQuestion(s.id, slideId, id);
  if (!q) throw new LiveError(404, 'Not found');

  if (action === 'highlight') {
    if (q.status !== 'live') throw new LiveError(409, 'Approve the question first');
    return { question: q, session: await control(db, s, { action: 'highlight', id }) };
  }
  if (action === 'unhighlight') {
    return { question: q, session: s.state.highlight === id ? await control(db, s, { action: 'highlight', id: null }) : s };
  }

  const status = action === 'approve' ? 'live' : action === 'hide' ? 'hidden' : 'answered';
  const saved = await db.setQuestionStatus(s.id, slideId, id, status);
  if (!saved) throw new LiveError(404, 'Not found');
  await announce(s, saved);
  /* A question that is hidden or answered is no longer the one being answered. */
  const session = status !== 'live' && s.state.highlight === id ? await control(db, s, { action: 'highlight', id: null }) : s;
  return { question: saved, session };
}

export interface AudienceQuestion extends PublicQuestion { mine: boolean; voted: boolean }

/** What a phone lists: questions everyone sees, plus this person's own that wait for approval. */
export async function audienceQuestions(db: Store, s: Session, slideId: string, token: string | null): Promise<AudienceQuestion[]> {
  qaSlide(s, slideId);
  const [all, voted] = await Promise.all([db.listQuestions(s.id, slideId), token ? db.myUpvotes(s.id, token) : Promise.resolve([])]);
  const votedIds = new Set(voted);
  return all
    .filter((q) => isShown(q.status) || (q.status === 'pending' && q.token === token))
    .map((q) => ({ ...publicQuestion(q), mine: q.token === token, voted: votedIds.has(q.id) }));
}
