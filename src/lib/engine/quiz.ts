/**
 * Quiz rules that need no storage: where a quiz is in its run, the points an answer earns, and
 * how scores become a leaderboard. Every time here is the server's clock.
 */
import { LIMITS } from '../limits';
import type { Quiz, QuizQuestion, QuizState, Score, SessionState } from '../types';

/**
 * lobby: players give their names. open: the question takes answers. closed: time is up, and how
 * people voted is shown. revealed: the correct answer and each player's points are shown.
 * board: the leaderboard is up.
 */
export type QuizPhase = 'lobby' | 'open' | 'closed' | 'revealed' | 'board';

export function quizPhase(q: QuizState, now: number): QuizPhase {
  if (q.board) return 'board';
  if (q.index < 0) return 'lobby';
  if (q.revealed) return 'revealed';
  return now < q.closesAt ? 'open' : 'closed';
}

/** The quiz in play and its current question, when the session state points at this quiz. */
export function quizInPlay(state: Pick<SessionState, 'quiz' | 'active'>, quiz: Quiz): { q: QuizState; question: QuizQuestion | null } | null {
  const q = state.quiz;
  if (!q || q.quizId !== quiz.id || state.active !== quiz.id) return null;
  return { q, question: quiz.questions[q.index] ?? null };
}

/** A correct answer earns half the points for being right and up to half more for being fast. */
export function quizPoints(correct: boolean, elapsedMs: number, seconds: number): number {
  if (!correct) return 0;
  const used = Math.min(1, Math.max(0, elapsedMs / (seconds * 1000)));
  const half = LIMITS.quizPoints / 2;
  return Math.round(half + half * (1 - used));
}

export const lobby = (quiz: Quiz): QuizState => ({ quizId: quiz.id, index: -1, openedAt: 0, closesAt: 0, revealed: false, board: false });
export const openQuestion = (quiz: Quiz, index: number, now: number): QuizState => ({
  quizId: quiz.id, index, openedAt: now, closesAt: now + quiz.questions[index].seconds * 1000, revealed: false, board: false,
});
/** Revealing also ends the countdown. */
export const reveal = (quiz: Quiz, q: QuizState, now: number): QuizState => ({ ...q, closesAt: Math.min(q.closesAt, now), revealed: true, correct: quiz.questions[q.index].correctId });
/** A quiz that has been played to the end, as it is shown when the facilitator opens it again. */
export const finished = (quiz: Quiz): QuizState => {
  const index = quiz.questions.length - 1;
  return { quizId: quiz.id, index, openedAt: 0, closesAt: 0, revealed: true, correct: quiz.questions[index]?.correctId, board: true };
};

export const isLastQuestion = (quiz: Quiz, q: QuizState) => q.index >= quiz.questions.length - 1;

export interface BoardEntry { nickname: string; total: number; last: number; rank: number; prevRank: number }

/**
 * Scores as a leaderboard, best first. Equal totals share a rank. `prevRank` is the rank before
 * the question `latestId`, so a screen can show who rose and who fell. After the first question
 * nobody had a rank before, so `prevRank` equals `rank`.
 */
export function rankBoard(scores: Score[], latestId: string | null): (BoardEntry & { token: string })[] {
  const rows = scores.map((s) => {
    const last = latestId && s.lastId === latestId ? s.last : 0;
    return { token: s.token, nickname: s.nickname, total: s.total, last, prev: s.total - last };
  });
  const rankOf = (value: number, key: 'total' | 'prev') => 1 + rows.filter((r) => r[key] > value).length;
  const rankedBefore = rows.some((r) => r.prev > 0);
  return rows
    .map((r) => {
      const rank = rankOf(r.total, 'total');
      return { token: r.token, nickname: r.nickname, total: r.total, last: r.last, rank, prevRank: rankedBefore ? rankOf(r.prev, 'prev') : rank };
    })
    .sort((a, b) => a.rank - b.rank || a.nickname.localeCompare(b.nickname));
}

const withoutToken = ({ token: _token, ...e }: BoardEntry & { token: string }): BoardEntry => e;
export const publicBoard = (board: (BoardEntry & { token: string })[], size: number): BoardEntry[] => board.slice(0, size).map(withoutToken);

/** A quiz question as the audience may receive it: without its correct answer. */
export const forAudience = (question: QuizQuestion): QuizQuestion => ({ ...question, correctId: '' });
