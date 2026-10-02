/**
 * Q&A on a session: asking, upvoting, and the facilitator's moderation and replies. Q&A runs for
 * the whole session, beside whatever poll is active. Each change is stored, then pushed on the
 * session's Q&A channel. The highlighted question lives in the session state.
 */
import { checkQuestion, checkReply, isShown, publicQuestion, type PublicQuestion } from './engine/questions';
import { newId } from './ids';
import { LIMITS } from './limits';
import { control, isClosed, LiveError } from './live';
import { publish } from './push/server';
import { qaChannel, type QuestionEvent } from './push/events';
import type { Store } from './store/types';
import type { Question, Session } from './types';

const eventOf = (q: Question): QuestionEvent => (isShown(q.status) ? publicQuestion(q) : { id: q.id, status: q.status });
const announce = (s: Session, q: Question) => publish(qaChannel(s.id), { kind: 'qa', q: eventOf(q) });

async function joined(db: Store, s: Session, token: string) {
  if (isClosed(s)) throw new LiveError(409, 'This session has ended');
  const person = await db.getPerson(s.id, token);
  if (!person) throw new LiveError(403, 'Join the session first');
  return person;
}

export async function ask(db: Store, s: Session, token: string, raw: unknown): Promise<Question> {
  const person = await joined(db, s, token);
  if (!s.state.qaOpen) throw new LiveError(409, 'Questions are closed');
  const c = checkQuestion(s.qa, raw, person.nickname);
  if (!c.ok) throw new LiveError(400, c.error);

  const all = await db.listQuestions(s.id);
  if (all.length >= LIMITS.questionsPerSession) throw new LiveError(409, `Up to ${LIMITS.questionsPerSession} questions per session`);
  if (all.filter((q) => q.token === token).length >= LIMITS.questionsPerPerson) throw new LiveError(409, 'You have asked the most allowed');

  /* A name given with the question becomes the person's name for the session. */
  if (c.name && c.name !== person.nickname) await db.join(s.id, token, c.name, LIMITS.peoplePerSession);

  const q: Question = {
    id: newId(),
    token,
    text: c.text,
    name: c.name,
    status: s.qa.moderation ? 'pending' : 'live',
    votes: 0,
    at: new Date().toISOString(),
    replies: [],
  };
  await db.addQuestion(s.id, q);
  await announce(s, q);
  return q;
}

/** One upvote per person. Votes stay open while questions are closed. */
export async function upvote(db: Store, s: Session, token: string, id: string): Promise<Question> {
  await joined(db, s, token);
  const q = await db.getQuestion(s.id, id);
  if (!q || !isShown(q.status)) throw new LiveError(404, 'Not found');
  if (q.status !== 'live') throw new LiveError(409, 'This question is answered');
  const voted = await db.upvote(s.id, id, token);
  if (!voted) throw new LiveError(409, 'You have already voted');
  await announce(s, voted);
  return voted;
}

/**
 * The asker takes their own question back, while it waits for review or is live. It leaves every
 * screen, as a hidden one does. Anyone else's question is "not found" to this person.
 */
export async function withdraw(db: Store, s: Session, token: string, id: string): Promise<void> {
  await joined(db, s, token);
  const q = await db.getQuestion(s.id, id);
  if (!q || q.token !== token || q.status === 'hidden') throw new LiveError(404, 'Not found');
  if (q.status === 'answered') throw new LiveError(409, 'This question is answered');
  const saved = await db.setQuestionStatus(s.id, id, 'hidden');
  if (!saved) throw new LiveError(404, 'Not found');
  await announce(s, saved);
  if (s.state.highlight === id) await control(db, s, { action: 'highlight', id: null });
}

export type ModerateAction = 'approve' | 'hide' | 'answered' | 'highlight' | 'unhighlight' | 'reply';
export const MODERATE_ACTIONS: ModerateAction[] = ['approve', 'hide', 'answered', 'highlight', 'unhighlight', 'reply'];

/** The facilitator's actions on one question. Returns the session, whose state holds the highlight. */
export async function moderate(db: Store, s: Session, id: string, action: ModerateAction, text?: unknown): Promise<{ question: Question; session: Session }> {
  if (isClosed(s)) throw new LiveError(409, 'This session has ended');
  const q = await db.getQuestion(s.id, id);
  if (!q) throw new LiveError(404, 'Not found');

  if (action === 'highlight') {
    if (q.status !== 'live') throw new LiveError(409, 'Approve the question first');
    return { question: q, session: await control(db, s, { action: 'highlight', id }) };
  }
  if (action === 'unhighlight') {
    return { question: q, session: s.state.highlight === id ? await control(db, s, { action: 'highlight', id: null }) : s };
  }
  if (action === 'reply') {
    const reply = checkReply(text);
    if (!reply) throw new LiveError(400, 'Type a reply');
    const saved = await db.addReply(s.id, id, { id: newId(), text: reply, at: new Date().toISOString() }, LIMITS.repliesPerQuestion);
    if (!saved) throw new LiveError(409, `Up to ${LIMITS.repliesPerQuestion} replies per question`);
    await announce(s, saved);
    return { question: saved, session: s };
  }

  const status = action === 'approve' ? 'live' : action === 'hide' ? 'hidden' : 'answered';
  const saved = await db.setQuestionStatus(s.id, id, status);
  if (!saved) throw new LiveError(404, 'Not found');
  await announce(s, saved);
  /* A question that is hidden or answered is no longer the one being answered. */
  const session = status !== 'live' && s.state.highlight === id ? await control(db, s, { action: 'highlight', id: null }) : s;
  return { question: saved, session };
}

export interface AudienceQuestion extends PublicQuestion { mine: boolean; voted: boolean }

/** What a phone lists: questions everyone sees, plus this person's own that wait for approval. */
export async function audienceQuestions(db: Store, s: Session, token: string | null): Promise<AudienceQuestion[]> {
  const [all, voted] = await Promise.all([db.listQuestions(s.id), token ? db.myUpvotes(s.id, token) : Promise.resolve([])]);
  const votedIds = new Set(voted);
  return all
    .filter((q) => isShown(q.status) || (q.status === 'pending' && q.token === token))
    .map((q) => ({ ...publicQuestion(q), mine: q.token === token, voted: votedIds.has(q.id) }));
}
