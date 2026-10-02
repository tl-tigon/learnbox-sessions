import type { QuestionStatus, Session, SessionState, Slide, Tally } from '../types';

/** The AppSync Events namespace every channel lives under. */
export const NAMESPACE = 'live';

/** Everyone in a session: slide moves, results on/off, lock, end. */
export const stateChannel = (sessionId: string) => `/${NAMESPACE}/${sessionId}/state`;
/** Counts for one slide, sent after each answer. */
export const tallyChannel = (sessionId: string, slideId: string) => `/${NAMESPACE}/${sessionId}/tally/${slideId}`;
/** Questions on one Q&A slide: asked, approved, upvoted, answered, hidden. */
export const qaChannel = (sessionId: string, slideId: string) => `/${NAMESPACE}/${sessionId}/qa/${slideId}`;

/**
 * A question as it travels to screens. Every phone can read this channel, so a question that is
 * waiting for approval or hidden is sent as its id and status only.
 */
export interface QuestionEvent { id: string; status: QuestionStatus; text?: string; name?: string; votes?: number; at?: string }

export type PushEvent =
  | { kind: 'state'; seq: number; status: Session['status']; state: SessionState; slide: Slide | null; index: number; total: number; now: number }
  | { kind: 'tally'; slideId: string; tally: Tally; text?: string; at?: string }
  | { kind: 'qa'; slideId: string; q: QuestionEvent };
