import type { Session, SessionState, Slide, Tally } from '../types';

/** The AppSync Events namespace every channel lives under. */
export const NAMESPACE = 'live';

/** Everyone in a session: slide moves, results on/off, lock, end. */
export const stateChannel = (sessionId: string) => `/${NAMESPACE}/${sessionId}/state`;
/** Counts for one slide, sent after each answer. */
export const tallyChannel = (sessionId: string, slideId: string) => `/${NAMESPACE}/${sessionId}/tally/${slideId}`;

export type PushEvent =
  | { kind: 'state'; seq: number; status: Session['status']; state: SessionState; slide: Slide | null; index: number; total: number }
  | { kind: 'tally'; slideId: string; tally: Tally; text?: string; at?: string };
