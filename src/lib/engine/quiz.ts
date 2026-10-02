/**
 * Quiz rules that need no storage: where a question is in its run, the points an answer earns,
 * and how scores become a leaderboard. Every time here is the server's clock.
 */
import { LIMITS } from '../limits';
import type { QuizSlide, QuizState, Score, SessionState, Slide } from '../types';

/**
 * ready: on the slide, not started. open: taking answers. closed: time is up, not yet revealed.
 * revealed: the correct answer and the points are shown.
 */
export type QuizPhase = 'ready' | 'open' | 'closed' | 'revealed';

export function quizPhase(state: Pick<SessionState, 'quiz'>, slideId: string, now: number): QuizPhase {
  const q = state.quiz;
  if (!q || q.slideId !== slideId) return 'ready';
  if (q.revealed) return 'revealed';
  return now < q.closesAt ? 'open' : 'closed';
}

/** A correct answer earns half the points for being right and up to half more for being fast. */
export function quizPoints(correct: boolean, elapsedMs: number, seconds: number): number {
  if (!correct) return 0;
  const used = Math.min(1, Math.max(0, elapsedMs / (seconds * 1000)));
  const half = LIMITS.quizPoints / 2;
  return Math.round(half + half * (1 - used));
}

/** The state of a question as it opens, and as it is revealed. */
export const openQuiz = (slide: QuizSlide, now: number): QuizState => ({ slideId: slide.id, openedAt: now, closesAt: now + slide.seconds * 1000, revealed: false });
export const revealQuiz = (slide: QuizSlide, q: QuizState, now: number): QuizState => ({ ...q, closesAt: Math.min(q.closesAt, now), revealed: true, correct: slide.correctId });
/** A question that has already been played is shown revealed when the presenter comes back to it. */
export const playedQuiz = (slide: QuizSlide): QuizState => ({ slideId: slide.id, openedAt: 0, closesAt: 0, revealed: true, correct: slide.correctId });

export interface BoardEntry { nickname: string; total: number; last: number; rank: number; prevRank: number }

/**
 * Scores as a leaderboard, best first. Equal totals share a rank. `prevRank` is the rank before
 * the question `latestSlideId`, so a screen can show who rose and who fell. After the first
 * question nobody had a rank before, so `prevRank` equals `rank`.
 */
export function rankBoard(scores: Score[], latestSlideId: string | null): (BoardEntry & { token: string })[] {
  const rows = scores.map((s) => {
    const last = latestSlideId && s.lastSlideId === latestSlideId ? s.last : 0;
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

/** The last quiz question at or before a slide: the one a leaderboard there compares against. */
export function latestQuizSlide(slides: Slide[], index: number): string | null {
  for (let i = Math.min(index, slides.length - 1); i >= 0; i--) if (slides[i].type === 'quiz') return slides[i].id;
  return null;
}

/** A leaderboard with no quiz question after it is the final one, shown as a podium. */
export const isFinalBoard = (slides: Slide[], index: number) => !slides.slice(index + 1).some((s) => s.type === 'quiz');

export const hasQuiz = (slides: Slide[]) => slides.some((s) => s.type === 'quiz');

/** A slide as the audience may receive it: a quiz question without its correct answer. */
export const forAudience = (slide: Slide): Slide => (slide.type === 'quiz' ? { ...slide, correctId: '' } : slide);
