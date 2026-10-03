import type { Answer, Question, QuestionStatus, Reply, Score, Session, SessionState, Tally } from '../types';

export interface SessionSummary { id: string; code: string; title: string; status: Session['status']; createdAt: string; closesAt: number; /** Polls, quizzes and surveys; the feedback form is not counted. */ interactions: number }

/** `points` is set on quiz answers: what the answer earned, worked out on the server when it arrived. */
export interface StoredAnswer { pollId: string; token: string; entry: number; answer: Answer; at: string; points?: number }
export interface Person { token: string; nickname: string; joinedAt: string }

/** An account's plan: on Pro until this moment (epoch seconds). An account with nothing stored is on Free. */
export interface Account { proUntil: number }
/**
 * One payment for Pro. `id` is the transaction id sent to the payment gateway, `amount` is in
 * rupees as the gateway takes it ("79.00"), `days` is how long it buys and `ref` is the
 * gateway's own id for the payment.
 */
export interface Order { id: string; sub: string; amount: string; days: number; status: 'pending' | 'paid' | 'failed'; createdAt: string; paidAt?: string; ref?: string }

/** What the facilitator edits. The live state changes only through `setState`. */
export type SessionEdit = Partial<Pick<Session, 'title' | 'interactions' | 'qa'>>;

/**
 * Everything the app keeps. Two implementations: memory (local development and tests) and
 * DynamoDB. Both must give the same guarantees, which the store tests check:
 * - a session code points at one live session at a time;
 * - a person's answer to a poll entry is written once, however many times it is sent;
 * - an answer is replaced only if it is still the one the change was made from;
 * - a state change applies only on top of the state it was made from (`seq`);
 * - a person's upvote on a question counts once, however many times it is sent;
 * - a paid order adds its days to the account's Pro once, however many times the payment is reported.
 */
export interface Store {
  /** Writes the session and claims its code. False if the code is taken by a live session. */
  createSession(s: Session): Promise<boolean>;
  getSession(id: string): Promise<Session | null>;
  sessionIdForCode(code: string): Promise<string | null>;
  listSessions(ownerSub: string): Promise<SessionSummary[]>;
  /**
   * Saves the facilitator's edits, only if the live state is still at `fromSeq`: an edit is
   * checked against a state, and must not land on a newer one. Returns the session as it now is,
   * or null on a clash or if there is no session.
   */
  updateSession(id: string, edit: SessionEdit, fromSeq: number): Promise<Session | null>;
  /** Applies `next` only if the stored state is still at `fromSeq`. Returns the session, or null on a clash. */
  setState(id: string, next: SessionState, fromSeq: number): Promise<Session | null>;
  /** Marks the session ended and frees its code. With `keepCode` the code stays its own until the close time (the feedback form is still taking answers). */
  endSession(s: Session, keepCode?: boolean): Promise<void>;
  /** Removes the session and everything recorded in it, and frees its code. */
  deleteSession(s: Session): Promise<void>;

  /** Adds a person, or finds them again. `full` when the session is at its people limit and they are new. */
  join(sessionId: string, token: string, nickname: string, cap: number): Promise<{ person: Person | null; full: boolean; people: number }>;
  getPerson(sessionId: string, token: string): Promise<Person | null>;
  countPeople(sessionId: string): Promise<number>;

  /** Writes one answer entry. False if that entry already exists. */
  addAnswer(sessionId: string, a: StoredAnswer): Promise<boolean>;
  /** Replaces an answer entry, only if the stored one was written at `prevAt`. False otherwise. */
  replaceAnswer(sessionId: string, a: StoredAnswer, prevAt: string): Promise<boolean>;
  /** One person's entries on one poll. */
  myAnswers(sessionId: string, pollId: string, token: string): Promise<StoredAnswer[]>;
  /** Everyone's answers on a poll, oldest first. With a limit, the newest that many. */
  pollAnswers(sessionId: string, pollId: string, limit?: number): Promise<StoredAnswer[]>;

  /** Adds to a poll's counts (`people` is 1 for a person's first answer, else 0) and returns the new totals. */
  bumpTally(sessionId: string, pollId: string, delta: Record<string, number>, people: number): Promise<Tally>;
  getTally(sessionId: string, pollId: string): Promise<Tally>;
  /** The counts of every poll in the session that has any, by poll id. */
  listTallies(sessionId: string): Promise<Record<string, Tally>>;

  addQuestion(sessionId: string, q: Question): Promise<void>;
  getQuestion(sessionId: string, id: string): Promise<Question | null>;
  /** Every question in the session, oldest first. */
  listQuestions(sessionId: string): Promise<Question[]>;
  /** Returns the question as it now is, or null if there is none. */
  setQuestionStatus(sessionId: string, id: string, status: QuestionStatus): Promise<Question | null>;
  /** Adds the facilitator's reply. Null if there is no such question, or it has `max` replies. */
  addReply(sessionId: string, id: string, reply: Reply, max: number): Promise<Question | null>;
  /** Adds one vote from this person. Null if they have already voted on it, or it does not exist. */
  upvote(sessionId: string, id: string, token: string): Promise<Question | null>;
  /** Ids of the questions this person has upvoted in the session. */
  myUpvotes(sessionId: string, token: string): Promise<string[]>;

  /** Deletes every answer to these polls or quiz questions, and their counts. */
  clearAnswers(sessionId: string, pollIds: string[]): Promise<void>;
  /** Deletes every player's score in the quiz. */
  clearScores(sessionId: string, quizId: string): Promise<void>;

  /** Adds a quiz answer's points to the player's total in that quiz and returns their score. */
  addScore(sessionId: string, quizId: string, token: string, nickname: string, questionId: string, points: number): Promise<Score>;
  /** Every player who has answered a question of the quiz. */
  listScores(sessionId: string, quizId: string): Promise<Score[]>;

  /** The account's plan, or null if it has never paid. */
  getAccount(sub: string): Promise<Account | null>;
  addOrder(o: Order): Promise<void>;
  getOrder(sub: string, id: string): Promise<Order | null>;
  /** The account's orders, newest first. */
  listOrders(sub: string): Promise<Order[]>;
  /**
   * Marks the order paid and adds its days to the account's Pro, together: from now, or from the
   * end of the Pro it already has. Null if there is no such order or it is already paid.
   */
  settleOrder(sub: string, id: string, ref: string): Promise<Account | null>;
  /** Marks a pending order failed. A paid order stays paid. */
  failOrder(sub: string, id: string): Promise<void>;
  /** Removes the account's plan and its orders. */
  deleteAccount(sub: string): Promise<void>;
}
