import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from '../store/memory';
import { audienceView, control, needsName, respond, screenView, sessionResults, startSession, stateEvent } from '../live';
import { cleanSlides } from '../engine/slides';
import { isFinalBoard, quizPhase, quizPoints, rankBoard } from '../engine/quiz';
import type { Store } from '../store/types';
import type { Presentation, Score, Session } from '../types';

const TOKEN = (n: number) => `tok-${String(n).padStart(16, '0')}`;
const T0 = new Date('2026-10-02T10:00:00Z').getTime();

function deck(): Presentation {
  const slides = cleanSlides([
    { id: 'quiz1', type: 'quiz', title: 'Largest planet?', seconds: 20, correctId: 'optb', options: [{ id: 'opta', label: 'Earth' }, { id: 'optb', label: 'Jupiter' }, { id: 'optc', label: 'Mars' }] },
    { id: 'lead1', type: 'leaderboard', title: 'Leaderboard' },
    { id: 'quiz2', type: 'quiz', title: 'Closest to the sun?', seconds: 10, correctId: 'optx', options: [{ id: 'optx', label: 'Mercury' }, { id: 'opty', label: 'Venus' }] },
    { id: 'lead2', type: 'leaderboard', title: 'Final' },
  ]);
  const now = new Date().toISOString();
  return { id: 'p1', ownerSub: 'u1', title: 'Quiz', slides, createdAt: now, updatedAt: now };
}

async function running(players = 3) {
  const db = memoryStore();
  const s = await startSession(db, 'u1', deck(), 'presenter');
  for (let i = 1; i <= players; i++) await db.join(s.id, TOKEN(i), `Player ${i}`, 1000);
  return { db, s };
}

/** A phone's view of a presenter-paced session. */
type Phone = Extract<Awaited<ReturnType<typeof audienceView>>, { index: number }>;
const phoneView = async (db: Store, s: Session, n: number) => (await audienceView(db, s, TOKEN(n))) as Phone;

/** The server's clock, moved by hand, so points depend on nothing but the times set here. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());
const at = (seconds: number) => vi.setSystemTime(T0 + seconds * 1000);

describe('points', () => {
  it('half for a correct answer, up to half more for speed, nothing for a wrong one', () => {
    expect(quizPoints(true, 0, 20)).toBe(1000);
    expect(quizPoints(true, 10_000, 20)).toBe(750);
    expect(quizPoints(true, 20_000, 20)).toBe(500);
    expect(quizPoints(true, 99_000, 20)).toBe(500);
    expect(quizPoints(false, 0, 20)).toBe(0);
  });
});

describe('a question', () => {
  it('takes answers only while it is open, timed on the server', async () => {
    const { db, s } = await running();
    await expect(respond(db, s, TOKEN(1), 'quiz1', { optionId: 'optb' })).rejects.toThrow(/not started/);

    const open = await control(db, s, { action: 'quiz-start' });
    expect(open.state.quiz).toMatchObject({ slideId: 'quiz1', openedAt: T0, closesAt: T0 + 20_000, revealed: false });
    expect(quizPhase(open.state, 'quiz1', Date.now())).toBe('open');

    at(5);
    await respond(db, open, TOKEN(1), 'quiz1', { optionId: 'optb' });
    at(19.9);
    await respond(db, open, TOKEN(2), 'quiz1', { optionId: 'opta' });
    at(20);
    expect(quizPhase(open.state, 'quiz1', Date.now())).toBe('closed');
    await expect(respond(db, open, TOKEN(3), 'quiz1', { optionId: 'optb' })).rejects.toThrow(/Time is up/);

    const scores = Object.fromEntries((await db.listScores(s.id)).map((x) => [x.nickname, x.total]));
    expect(scores).toEqual({ 'Player 1': 875, 'Player 2': 0 });
  });

  it('counts one answer per player, however many are sent', async () => {
    const { db, s } = await running();
    const open = await control(db, s, { action: 'quiz-start' });
    const sends = await Promise.allSettled(Array.from({ length: 10 }, () => respond(db, open, TOKEN(1), 'quiz1', { optionId: 'optb' })));
    expect(sends.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.listScores(s.id))[0].total).toBe(1000);
  });

  it('keeps the correct answer and the spread from the audience until the reveal', async () => {
    const { db, s } = await running();
    const open = await control(db, s, { action: 'quiz-start' });
    await respond(db, open, TOKEN(1), 'quiz1', { optionId: 'optb' });

    const phone = await phoneView(db, open, 1);
    expect(phone.slide).toMatchObject({ type: 'quiz', correctId: '' });
    expect(phone).toMatchObject({ tally: null, me: undefined, mine: [{ type: 'quiz', optionId: 'optb' }] });
    expect(stateEvent(open)).toMatchObject({ slide: { correctId: '' } });
    expect(open.state.quiz?.correct).toBeUndefined();
    expect((await screenView(db, open)).tally).toEqual({ people: 1, counts: {} });

    at(8);
    const shown = await control(db, open, { action: 'quiz-reveal' });
    expect(shown.state.quiz).toMatchObject({ revealed: true, correct: 'optb', closesAt: T0 + 8000 });
    expect((await screenView(db, shown)).tally).toEqual({ people: 1, counts: { optb: 1 } });
    await expect(respond(db, shown, TOKEN(2), 'quiz1', { optionId: 'optb' })).rejects.toThrow(/Time is up/);
    expect(await audienceView(db, shown, TOKEN(1))).toMatchObject({ me: { rank: 1, total: 1000, last: 1000, players: 1 } });
    expect(await audienceView(db, shown, TOKEN(2))).toMatchObject({ me: { rank: null, total: 0, last: 0 } });
  });

  it('is played once; coming back to it shows it revealed', async () => {
    const { db, s } = await running();
    let cur = await control(db, s, { action: 'quiz-start' });
    await expect(control(db, cur, { action: 'quiz-start' })).rejects.toThrow(/played/);
    cur = await control(db, cur, { action: 'next' });
    expect(cur.state.quiz).toBeNull();
    await expect(control(db, cur, { action: 'quiz-start' })).rejects.toThrow(/not a quiz/);
    await expect(control(db, cur, { action: 'quiz-reveal' })).rejects.toThrow(/Start the question/);
    cur = await control(db, cur, { action: 'prev' });
    expect(cur.state.quiz).toMatchObject({ slideId: 'quiz1', revealed: true, correct: 'optb' });
  });
});

describe('leaderboard', () => {
  it('ranks by points, shares a rank on a tie, and shows the rank before the last question', () => {
    const scores: Score[] = [
      { token: 'a', nickname: 'Asha', total: 1500, last: 600, lastSlideId: 'q2' },
      { token: 'b', nickname: 'Rohan', total: 1500, last: 1000, lastSlideId: 'q2' },
      { token: 'c', nickname: 'Meera', total: 800, last: 800, lastSlideId: 'q1' },
    ];
    expect(rankBoard(scores, 'q2').map((e) => [e.nickname, e.rank, e.prevRank, e.last])).toEqual([
      ['Asha', 1, 1, 600],
      ['Rohan', 1, 3, 1000],
      ['Meera', 3, 2, 0],
    ]);
  });

  it('runs across two questions to a final board with the top players', async () => {
    const { db, s } = await running(3);
    let cur = await control(db, s, { action: 'quiz-start' });
    at(2);
    await respond(db, cur, TOKEN(1), 'quiz1', { optionId: 'optb' });
    at(10);
    await respond(db, cur, TOKEN(2), 'quiz1', { optionId: 'optb' });
    await respond(db, cur, TOKEN(3), 'quiz1', { optionId: 'optc' });
    cur = await control(db, cur, { action: 'quiz-reveal' });
    cur = await control(db, cur, { action: 'next' });

    const first = await screenView(db, cur);
    expect(first.board).toMatchObject({ players: 3, final: false });
    expect(first.board?.entries.map((e) => [e.nickname, e.total, e.rank])).toEqual([['Player 1', 950, 1], ['Player 2', 750, 2], ['Player 3', 0, 3]]);
    expect(first.board?.entries[0]).not.toHaveProperty('token');
    expect((await phoneView(db, cur, 2)).top).toBeUndefined();

    cur = await control(db, cur, { action: 'next' });
    at(100);
    cur = await control(db, cur, { action: 'quiz-start' });
    await respond(db, cur, TOKEN(2), 'quiz2', { optionId: 'optx' });
    await respond(db, cur, TOKEN(1), 'quiz2', { optionId: 'opty' });
    cur = await control(db, cur, { action: 'quiz-reveal' });
    cur = await control(db, cur, { action: 'next' });

    expect(isFinalBoard(cur.slides, cur.state.current)).toBe(true);
    const final = await screenView(db, cur);
    expect(final.board?.final).toBe(true);
    expect(final.board?.entries.map((e) => [e.nickname, e.total, e.rank, e.prevRank])).toEqual([['Player 2', 1750, 1, 2], ['Player 1', 950, 2, 1], ['Player 3', 0, 3, 3]]);
    const phone = await phoneView(db, cur, 1);
    expect(phone.me).toMatchObject({ rank: 2, total: 950, players: 3 });
    expect(phone.top?.map((e) => e.nickname)).toEqual(['Player 2', 'Player 1', 'Player 3']);
  });
});

describe('sessions with a quiz', () => {
  it('ask each person for a name, and run only with a presenter', async () => {
    const { db, s } = await running(0);
    expect(needsName(s)).toBe(true);
    await expect(startSession(db, 'u2', deck(), 'survey')).rejects.toThrow(/presenter/);
  });

  it('results carry the points and the leaderboard, without anyone’s token', async () => {
    const { db, s } = await running(2);
    const cur: Session = await control(db, s, { action: 'quiz-start' });
    await respond(db, cur, TOKEN(1), 'quiz1', { optionId: 'optb' });
    const r = await sessionResults(db, cur);
    expect(r.rows.map((x) => x.slide.id)).toEqual(['quiz1', 'quiz2']);
    expect(r.rows[0].answers).toEqual([{ answer: { type: 'quiz', optionId: 'optb' }, at: new Date(T0).toISOString(), points: 1000 }]);
    expect(r.board).toEqual([{ nickname: 'Player 1', total: 1000, last: 0, rank: 1, prevRank: 1 }]);
  });
});
