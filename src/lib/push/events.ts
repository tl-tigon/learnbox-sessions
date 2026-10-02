import type { Poll, QuestionStatus, QuizQuestion, Reply, Session, SessionState, Survey, Tally } from '../types';

/** The AppSync Events namespace every channel lives under. */
export const NAMESPACE = 'live';

/** Everyone in a session: the active poll, results on/off, lock, Q&A open, quiz steps, end. */
export const stateChannel = (sessionId: string) => `/${NAMESPACE}/${sessionId}/state`;
/** Counts for one poll or quiz question, sent after each answer. */
export const tallyChannel = (sessionId: string, pollId: string) => `/${NAMESPACE}/${sessionId}/tally/${pollId}`;
/** The session's questions: asked, approved, upvoted, replied to, answered, hidden. */
export const qaChannel = (sessionId: string) => `/${NAMESPACE}/${sessionId}/qa`;

/** The interaction the facilitator has started, as the audience receives it. A quiz question comes without its correct answer. */
export type ActiveForAudience =
  | { kind: 'poll'; poll: Poll }
  | { kind: 'survey'; survey: Survey }
  | { kind: 'quiz'; id: string; title: string; count: number; question: QuizQuestion | null };

/**
 * A question as it travels to screens. Every phone can read this channel, so a question that is
 * waiting for approval or hidden is sent as its id and status only.
 */
export interface QuestionEvent { id: string; status: QuestionStatus; text?: string; name?: string; votes?: number; at?: string; replies?: Reply[] }

export type PushEvent =
  | { kind: 'state'; seq: number; status: Session['status']; state: SessionState; active: ActiveForAudience | null; now: number }
  /* `withheld`: results are hidden or the poll is in a survey, so only the number who answered is sent. */
  | { kind: 'tally'; pollId: string; tally: Tally; text?: string; at?: string; withheld?: boolean }
  | { kind: 'qa'; q: QuestionEvent };
