import type { Answer, Presentation, Question, QuestionStatus, Session, SessionState, Tally } from '../types';

export interface PresentationSummary { id: string; title: string; slideCount: number; updatedAt: string }
export interface SessionSummary { id: string; code: string; title: string; status: Session['status']; mode: Session['mode']; createdAt: string; closesAt: number }

export interface StoredAnswer { slideId: string; token: string; entry: number; answer: Answer; at: string }
export interface Person { token: string; nickname: string; joinedAt: string }

/**
 * Everything the app keeps. Two implementations: memory (local development and tests) and
 * DynamoDB. Both must give the same guarantees, which the store tests check:
 * - a session code points at one live session at a time;
 * - a person's answer to a slide entry is written once, however many times it is sent;
 * - a state change applies only on top of the state it was made from (`seq`);
 * - a person's upvote on a question counts once, however many times it is sent.
 */
export interface Store {
  listPresentations(ownerSub: string): Promise<PresentationSummary[]>;
  getPresentation(id: string): Promise<Presentation | null>;
  putPresentation(p: Presentation): Promise<void>;
  deletePresentation(p: Presentation): Promise<void>;

  /** Writes the session and claims its code. False if the code is taken by a live session. */
  createSession(s: Session): Promise<boolean>;
  getSession(id: string): Promise<Session | null>;
  sessionIdForCode(code: string): Promise<string | null>;
  listSessions(ownerSub: string): Promise<SessionSummary[]>;
  /** Applies `next` only if the stored state is still at `fromSeq`. Returns the session, or null on a clash. */
  setState(id: string, next: SessionState, fromSeq: number): Promise<Session | null>;
  /** Marks the session ended and frees its code. */
  endSession(s: Session): Promise<void>;

  /** Adds a person, or finds them again. `full` when the session is at its people limit and they are new. */
  join(sessionId: string, token: string, nickname: string, cap: number): Promise<{ person: Person | null; full: boolean; people: number }>;
  getPerson(sessionId: string, token: string): Promise<Person | null>;
  countPeople(sessionId: string): Promise<number>;

  /** Writes one answer entry. False if that entry already exists. */
  addAnswer(sessionId: string, a: StoredAnswer): Promise<boolean>;
  /** One person's entries on one slide. */
  myAnswers(sessionId: string, slideId: string, token: string): Promise<StoredAnswer[]>;
  /** Everyone's answers on a slide, oldest first. */
  slideAnswers(sessionId: string, slideId: string, limit?: number): Promise<StoredAnswer[]>;

  /** Adds to a slide's counts and returns the new totals. */
  bumpTally(sessionId: string, slideId: string, delta: Record<string, number>, newPerson: boolean): Promise<Tally>;
  getTally(sessionId: string, slideId: string): Promise<Tally>;

  addQuestion(sessionId: string, q: Question): Promise<void>;
  getQuestion(sessionId: string, slideId: string, id: string): Promise<Question | null>;
  /** Every question on a slide, oldest first. */
  listQuestions(sessionId: string, slideId: string): Promise<Question[]>;
  /** Returns the question as it now is, or null if there is none. */
  setQuestionStatus(sessionId: string, slideId: string, id: string, status: QuestionStatus): Promise<Question | null>;
  /** Adds one vote from this person. Null if they have already voted on it, or it does not exist. */
  upvote(sessionId: string, slideId: string, id: string, token: string): Promise<Question | null>;
  /** Ids of the questions this person has upvoted in the session. */
  myUpvotes(sessionId: string, token: string): Promise<string[]>;
}
