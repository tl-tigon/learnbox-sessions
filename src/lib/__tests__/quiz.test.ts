import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audienceView, control, editSession, hostView, respond, respondQuiz, sessionResults, stateEvent, wallView } from '../live';
import { quizPoints, rankBoard } from '../engine/quiz';
import type { Store } from '../store/types';
import type { Quiz, Score, Session } from '../types';
import { INTERACTIONS, running, TOKEN } from './helpers';

const T0 = new Date('2026-10-02T10:00:00Z').getTime();

/** A phone's view while a quiz is the active interaction. */
type QuizView = Extract<NonNullable<Awaited<ReturnType<typeof audienceView>>['active']>, { kind: 'quiz' }>;
const phone = async (db: Store, s: Session, n: number) => (await audienceView(db, s, TOKEN(n))).active as QuizView & { me?: { rank: number | null; total: number; last: number; players: number }; top?: { nickname: string }[] };

/** The server's clock, moved by hand, so points depend on nothing but the times set here. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());
const at = (seconds: number) => vi.setSystemTime(T0 + seconds * 1000);

/** A session with the quiz started and its first question open. */
async function firstQuestion(people = 3) {
  const { db, s } = await running(people);
  const lobby = await control(db, s, { action: 'activate', id: 'quiz1' });
  return { db, lobby, open: await control(db, lobby, { action: 'quiz-next' }) };
}

describe('points', () => {
  it('half for a correct answer, up to half more for speed, nothing for a wrong one', () => {
    expect(quizPoints(true, 0, 20)).toBe(1000);
    expect(quizPoints(true, 10_000, 20)).toBe(750);
    expect(quizPoints(true, 20_000, 20)).toBe(500);
    expect(quizPoints(true, 99_000, 20)).toBe(500);
    expect(quizPoints(false, 0, 20)).toBe(0);
  });
});

describe('a quiz question', () => {
  it('takes answers only while it is open, timed on the server', async () => {
    const { db, lobby, open } = await firstQuestion();
    expect(lobby.state.quiz).toMatchObject({ quizId: 'quiz1', index: -1 });
    await expect(respondQuiz(db, lobby, TOKEN(1), 'ques1', { optionId: 'qopb' })).rejects.toThrow(/not started/);
    expect(open.state.quiz).toMatchObject({ index: 0, openedAt: T0, closesAt: T0 + 20_000, revealed: false });

    at(5);
    await respondQuiz(db, open, TOKEN(1), 'ques1', { optionId: 'qopb' });
    at(19.9);
    await respondQuiz(db, open, TOKEN(2), 'ques1', { optionId: 'qopa' });
    at(20);
    await expect(respondQuiz(db, open, TOKEN(3), 'ques1', { optionId: 'qopb' })).rejects.toThrow(/Time is up/);

    const scores = Object.fromEntries((await db.listScores(open.id, 'quiz1')).map((x) => [x.nickname, x.total]));
    expect(scores).toEqual({ 'Person 1': 875, 'Person 2': 0 });
  });

  it('counts one answer per player, and takes none through the poll route, for another question or without a name', async () => {
    const { db, open } = await firstQuestion();
    const sends = await Promise.allSettled(Array.from({ length: 10 }, () => respondQuiz(db, open, TOKEN(1), 'ques1', { optionId: 'qopb' })));
    expect(sends.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.listScores(open.id, 'quiz1'))[0].total).toBe(1000);
    /* A second answer would change nothing: a quiz answer cannot be changed. */
    await expect(respondQuiz(db, open, TOKEN(1), 'ques1', { optionId: 'qopa' })).rejects.toThrow(/already answered/);
    await expect(respond(db, open, TOKEN(2), 'ques1', { optionId: 'qopb' })).rejects.toThrow(/not open/);
    await expect(respondQuiz(db, open, TOKEN(2), 'ques2', { optionId: 'qopx' })).rejects.toThrow(/over/);
    await expect(respondQuiz(db, open, TOKEN(2), 'ques1', { optionId: 'nope' })).rejects.toThrow(/Pick an option/);
    await db.join(open.id, TOKEN(8), '', 1000);
    await expect(respondQuiz(db, open, TOKEN(8), 'ques1', { optionId: 'qopb' })).rejects.toThrow(/name/);
  });

  it('keeps the correct answer from the audience until the reveal, and how people voted until time is up', async () => {
    const { db, open } = await firstQuestion();
    await respondQuiz(db, open, TOKEN(1), 'ques1', { optionId: 'qopb' });

    const before = await phone(db, open, 1);
    expect(before.question).toMatchObject({ id: 'ques1', correctId: '' });
    expect(before).toMatchObject({ me: undefined, mine: [{ type: 'quiz', optionId: 'qopb' }] });
    expect(JSON.stringify(stateEvent(open))).not.toContain('"correctId":"qopb"');
    expect(open.state.quiz?.correct).toBeUndefined();
    expect((await wallView(db, open)).tally).toEqual({ people: 1, counts: {} });
    expect(JSON.stringify(await wallView(db, open))).not.toContain('"correctId":"qopb"');

    at(8);
    const shown = await control(db, open, { action: 'quiz-reveal' });
    expect(shown.state.quiz).toMatchObject({ revealed: true, correct: 'qopb', closesAt: T0 + 8000 });
    expect((await wallView(db, shown)).tally).toEqual({ people: 1, counts: { qopb: 1 } });
    await expect(respondQuiz(db, shown, TOKEN(2), 'ques1', { optionId: 'qopb' })).rejects.toThrow(/Time is up/);
    expect(await phone(db, shown, 1)).toMatchObject({ me: { rank: 1, total: 1000, last: 1000, players: 1 } });
    expect(await phone(db, shown, 2)).toMatchObject({ me: { rank: null, total: 0, last: 0 } });
  });

  it('shows how people voted once time is up, before the reveal', async () => {
    const { db, open } = await firstQuestion();
    await respondQuiz(db, open, TOKEN(1), 'ques1', { optionId: 'qopa' });
    at(21);
    expect((await wallView(db, open)).tally).toEqual({ people: 1, counts: { qopa: 1 } });
    expect(open.state.quiz?.correct).toBeUndefined();
  });

  it('moves in order: reveal before the next question, and no next after the last', async () => {
    const { db, lobby, open } = await firstQuestion();
    await expect(control(db, lobby, { action: 'quiz-reveal' })).rejects.toThrow(/Start the quiz/);
    await expect(control(db, open, { action: 'quiz-next' })).rejects.toThrow(/Reveal/);
    await expect(control(db, open, { action: 'quiz-board', on: true })).rejects.toThrow(/Reveal/);
    let cur = await control(db, open, { action: 'quiz-reveal' });
    await expect(control(db, cur, { action: 'quiz-reveal' })).rejects.toThrow(/already revealed/);
    cur = await control(db, cur, { action: 'quiz-next' });
    expect(cur.state.quiz).toMatchObject({ index: 1, revealed: false, board: false });
    cur = await control(db, cur, { action: 'quiz-reveal' });
    await expect(control(db, cur, { action: 'quiz-next' })).rejects.toThrow(/last question/);
    const poll = await control(db, cur, { action: 'activate', id: 'choice1' });
    await expect(control(db, poll, { action: 'quiz-next' })).rejects.toThrow(/Start the quiz/);
  });
});

describe('leaderboard', () => {
  it('ranks by points, shares a rank on a tie, and shows the rank before the last question', () => {
    const scores: Score[] = [
      { token: 'a', nickname: 'Asha', total: 1500, last: 600, lastId: 'q2' },
      { token: 'b', nickname: 'Rohan', total: 1500, last: 1000, lastId: 'q2' },
      { token: 'c', nickname: 'Meera', total: 800, last: 800, lastId: 'q1' },
    ];
    expect(rankBoard(scores, 'q2').map((e) => [e.nickname, e.rank, e.prevRank, e.last])).toEqual([
      ['Asha', 1, 1, 600],
      ['Rohan', 1, 3, 1000],
      ['Meera', 3, 2, 0],
    ]);
  });

  it('runs across two questions to a final board; the quiz is then played and cannot be run again', async () => {
    const { db, open } = await firstQuestion();
    at(2);
    await respondQuiz(db, open, TOKEN(1), 'ques1', { optionId: 'qopb' });
    at(10);
    await respondQuiz(db, open, TOKEN(2), 'ques1', { optionId: 'qopb' });
    await respondQuiz(db, open, TOKEN(3), 'ques1', { optionId: 'qopc' });
    let cur = await control(db, open, { action: 'quiz-reveal' });
    cur = await control(db, cur, { action: 'quiz-board', on: true });

    const first = await wallView(db, cur);
    expect(first.board).toMatchObject({ players: 3, final: false });
    expect(first.board?.entries.map((e) => [e.nickname, e.total, e.rank])).toEqual([['Person 1', 950, 1], ['Person 2', 750, 2], ['Person 3', 0, 3]]);
    expect(first.board?.entries[0]).not.toHaveProperty('token');
    expect((await phone(db, cur, 2)).top).toBeUndefined();
    expect(cur.state.played ?? []).toEqual([]);

    at(100);
    cur = await control(db, cur, { action: 'quiz-next' });
    await respondQuiz(db, cur, TOKEN(2), 'ques2', { optionId: 'qopx' });
    await respondQuiz(db, cur, TOKEN(1), 'ques2', { optionId: 'qopy' });
    cur = await control(db, cur, { action: 'quiz-reveal' });
    cur = await control(db, cur, { action: 'quiz-board', on: true });

    const final = await wallView(db, cur);
    expect(final.board?.final).toBe(true);
    expect(final.board?.entries.map((e) => [e.nickname, e.total, e.rank, e.prevRank])).toEqual([['Person 2', 1750, 1, 2], ['Person 1', 950, 2, 1], ['Person 3', 0, 3, 3]]);
    const p1 = await phone(db, cur, 1);
    expect(p1.me).toMatchObject({ rank: 2, total: 950, players: 3 });
    expect(p1.top?.map((e) => e.nickname)).toEqual(['Person 2', 'Person 1', 'Person 3']);
    expect(cur.state.played).toEqual(['quiz1']);

    /* Leaving and coming back shows the final board; the quiz does not start again. */
    cur = await control(db, cur, { action: 'activate', id: 'choice1' });
    cur = await control(db, cur, { action: 'activate', id: 'quiz1' });
    expect(cur.state.quiz).toMatchObject({ index: 1, revealed: true, board: true });
    await expect(control(db, cur, { action: 'quiz-next' })).rejects.toThrow(/last question/);
    await expect(respondQuiz(db, cur, TOKEN(3), 'ques2', { optionId: 'qopx' })).rejects.toThrow(/Time is up/);
  });

  it('a quiz left midway picks up where it was when the facilitator comes back to it', async () => {
    const { db, open } = await firstQuestion();
    await respondQuiz(db, open, TOKEN(1), 'ques1', { optionId: 'qopb' });
    let cur = await control(db, open, { action: 'activate', id: null });
    await expect(respondQuiz(db, cur, TOKEN(2), 'ques1', { optionId: 'qopb' })).rejects.toThrow(/not open/);
    cur = await control(db, cur, { action: 'activate', id: 'quiz1' });
    expect(cur.state.quiz).toMatchObject({ index: 0, revealed: false });
    await expect(respondQuiz(db, cur, TOKEN(2), 'ques1', { optionId: 'qopb' })).resolves.toBeTruthy();
  });
});

describe('a quiz and the rest of the session', () => {
  it('its questions are frozen once it has started', async () => {
    const { db, s } = await running();
    const quizOf = (x: Session) => x.interactions.find((i) => i.id === 'quiz1') as Quiz;
    const swapped = INTERACTIONS.map((i) => (i.id === 'quiz1' ? { ...i, questions: [{ ...(i as { questions: object[] }).questions[0], correctId: 'qopa' }] } : i));
    /* In the lobby the quiz can still be edited. */
    const lobby = await control(db, s, { action: 'activate', id: 'quiz1' });
    const edited = await editSession(db, lobby, { interactions: swapped });
    expect(quizOf(edited).questions).toHaveLength(1);
    /* Once a question has opened, an edit to the quiz is ignored; the rest of the same edit still lands. */
    const open = await control(db, edited, { action: 'quiz-next' });
    const kept = await editSession(db, open, { interactions: INTERACTIONS.map((i) => (i.id === 'choice1' ? { ...i, title: 'Renamed' } : i)) });
    expect(quizOf(kept).questions).toHaveLength(1);
    expect(quizOf(kept).questions[0].correctId).toBe('qopa');
    expect(kept.interactions.find((i) => i.id === 'choice1')?.title).toBe('Renamed');
  });

  it('results carry each question, the leaderboard and no token; the facilitator sees who has answered', async () => {
    const { db, open } = await firstQuestion(2);
    await respondQuiz(db, open, TOKEN(1), 'ques1', { optionId: 'qopb' });
    expect((await hostView(db, open)).answered).toEqual({ ques1: 1 });
    const r = await sessionResults(db, open);
    const quizItems = r.items.filter((i) => i.kind !== 'poll');
    expect(quizItems.map((i) => i.kind)).toEqual(['quiz-question', 'quiz-question', 'board']);
    expect(quizItems[2]).toMatchObject({ board: [{ nickname: 'Person 1', total: 1000, rank: 1 }] });
    expect(JSON.stringify(r)).not.toContain(TOKEN(1));
  });
});
