/** Cases found by reviewing the code for bugs and ways around the rules. Each one failed before its fix. */
import { describe, expect, it } from 'vitest';
import { memoryStore } from '../store/memory';
import { control, createSession, editSession, hostView, respond, respondQuiz, respondSurvey, sessionResults } from '../live';
import { LIMITS } from '../limits';
import type { Quiz, Session } from '../types';
import { INTERACTIONS, running, TOKEN } from './helpers';

const withPoll = (id: string, change: Record<string, unknown>) => INTERACTIONS.map((i) => (i.id === id ? { ...i, ...change } : i));
const quizOf = (s: Session) => s.interactions.find((i) => i.id === 'quiz1') as Quiz | undefined;

describe('a changed vote after the facilitator edits the poll', () => {
  it('ranking: an added option does not leave the old points behind', async () => {
    const { db, s } = await running();
    let cur = await control(db, s, { action: 'activate', id: 'rank1' });
    await respond(db, cur, TOKEN(1), 'rank1', { order: ['rnka', 'rnkb', 'rnkc'] });
    cur = await editSession(db, cur, { interactions: withPoll('rank1', { options: [{ id: 'rnka', label: 'A' }, { id: 'rnkb', label: 'B' }, { id: 'rnkc', label: 'C' }, { id: 'rnkd', label: 'D' }] }) });
    await respond(db, cur, TOKEN(1), 'rank1', { order: ['rnkd', 'rnkc', 'rnkb', 'rnka'] });
    expect(await db.getTally(s.id, 'rank1')).toEqual({ people: 1, counts: { rnka: 1, rnkb: 2, rnkc: 3, rnkd: 4 } });
  });

  it('choice: a removed option and a lower pick limit do not leave the person counted twice', async () => {
    const { db, s } = await running();
    let cur = await editSession(db, s, { interactions: withPoll('choice1', { maxPicks: 2 }) });
    cur = await control(db, cur, { action: 'activate', id: 'choice1' });
    await respond(db, cur, TOKEN(1), 'choice1', { optionIds: ['opta', 'optb'] });
    cur = await editSession(db, cur, { interactions: withPoll('choice1', { maxPicks: 1, options: [{ id: 'opta', label: 'A' }, { id: 'optc', label: 'C' }] }) });
    await respond(db, cur, TOKEN(1), 'choice1', { optionIds: ['optc'] });
    expect(await db.getTally(s.id, 'choice1')).toEqual({ people: 1, counts: { opta: 0, optb: 0, optc: 1 } });
  });
});

describe('what an answer sends back and out', () => {
  it('only the number who answered, while results are hidden and for a survey', async () => {
    const { db, s } = await running();
    let cur = await control(db, s, { action: 'activate', id: 'choice1' });
    expect((await respond(db, cur, TOKEN(1), 'choice1', { optionIds: ['opta'] })).tally).toEqual({ people: 1, counts: { opta: 1 } });
    cur = await control(db, cur, { action: 'results', on: false });
    expect((await respond(db, cur, TOKEN(2), 'choice1', { optionIds: ['optb'] })).tally).toEqual({ people: 2, counts: {} });
    cur = await control(db, cur, { action: 'results', on: true });
    cur = await control(db, cur, { action: 'activate', id: 'survey1' });
    /* One survey question answered on its own, through the poll route. */
    expect((await respond(db, cur, TOKEN(1), 'srate', { value: 4 })).tally).toEqual({ people: 1, counts: {} });
    await respondSurvey(db, cur, TOKEN(2), 'survey1', { srate: { value: 5 } });
    expect(await db.getTally(s.id, 'srate')).toEqual({ people: 2, counts: { '4': 1, '5': 1 } });
  });
});

describe('edits against the live state', () => {
  it('an edit made from a stale copy of the session cannot change a quiz that has since started', async () => {
    const { db, s } = await running();
    const lobby = await control(db, s, { action: 'activate', id: 'quiz1' });
    await control(db, lobby, { action: 'quiz-next' });
    /* `lobby` is now out of date: the first question is open. The edit still lands, without touching the quiz. */
    const saved = await editSession(db, lobby, { title: 'Renamed', interactions: withPoll('quiz1', { questions: [{ id: 'ques1', title: 'Changed?', correctId: 'qopa', seconds: 20, options: [{ id: 'qopa', label: 'Earth' }, { id: 'qopb', label: 'Jupiter' }] }] }) });
    expect(saved.title).toBe('Renamed');
    expect(quizOf(saved)?.questions).toHaveLength(2);
    expect(quizOf(saved)?.questions[0]).toMatchObject({ title: 'Largest?', correctId: 'qopb' });
    expect(saved.state.quiz).toMatchObject({ quizId: 'quiz1', index: 0 });
  });

  it('deleting a quiz that has started lets go of it; a quiz added later with the same id starts fresh', async () => {
    const { db, s } = await running();
    let cur = await control(db, s, { action: 'activate', id: 'quiz1' });
    cur = await control(db, cur, { action: 'quiz-next' });
    await respondQuiz(db, cur, TOKEN(1), 'ques1', { optionId: 'qopb' });
    cur = await control(db, cur, { action: 'quiz-reveal' });
    cur = await control(db, cur, { action: 'quiz-next' });
    cur = await control(db, cur, { action: 'quiz-reveal' });
    cur = await control(db, cur, { action: 'quiz-board', on: true });
    expect(cur.state.played).toEqual(['quiz1']);

    cur = await editSession(db, cur, { interactions: INTERACTIONS.filter((i) => i.id !== 'quiz1') });
    expect(cur.state).toMatchObject({ active: null, quiz: null, played: [] });
    /* The same id comes back with one question. Nothing in the state points past its end. */
    cur = await editSession(db, cur, { interactions: withPoll('quiz1', { questions: [{ id: 'newq1', title: 'New?', correctId: 'nopa', seconds: 10, options: [{ id: 'nopa', label: 'Yes' }, { id: 'nopb', label: 'No' }] }] }) });
    expect(quizOf(cur)?.questions).toHaveLength(1);
    cur = await control(db, cur, { action: 'activate', id: 'quiz1' });
    expect(cur.state.quiz).toMatchObject({ index: -1, board: false });
    cur = await control(db, cur, { action: 'quiz-next' });
    await expect(control(db, cur, { action: 'quiz-reveal' })).resolves.toMatchObject({ state: { quiz: { revealed: true, correct: 'nopa' } } });
  });

  it('a session that would not fit in its database row is refused', async () => {
    const { db, s } = await running();
    const long = 'x'.repeat(LIMITS.titleChars);
    const option = (n: number) => ({ label: `${n}${'y'.repeat(LIMITS.optionChars)}` });
    const heavy = Array.from({ length: LIMITS.interactionsPerSession }, () => ({
      type: 'survey', title: long,
      polls: Array.from({ length: LIMITS.itemsPerGroup }, () => ({ type: 'choice', title: long, maxPicks: 1, options: Array.from({ length: LIMITS.optionsPerChoice }, (_, n) => option(n)) })),
    }));
    await expect(editSession(db, s, { interactions: heavy })).rejects.toThrow(/holds too much/);
    expect((await db.getSession(s.id))?.interactions).toHaveLength(INTERACTIONS.length);
  });
});

describe('results', () => {
  it('are counted from the stored answers, whatever the running counts say', async () => {
    const { db, s } = await running();
    let cur = await control(db, s, { action: 'activate', id: 'choice1' });
    await respond(db, cur, TOKEN(1), 'choice1', { optionIds: ['opta'] });
    await respond(db, cur, TOKEN(2), 'choice1', { optionIds: ['optb'] });
    cur = await control(db, cur, { action: 'activate', id: 'quiz1' });
    cur = await control(db, cur, { action: 'quiz-next' });
    await respondQuiz(db, cur, TOKEN(1), 'ques1', { optionId: 'qopb' });
    /* The running copies drift: a count goes wrong and a score is lost. */
    await db.bumpTally(s.id, 'choice1', { opta: 7, optc: -3 }, 5);
    await db.addScore(s.id, 'quiz1', TOKEN(1), 'Person 1', 'ques1', -400);

    const r = await sessionResults(db, cur);
    const choice = r.items.find((i) => i.kind === 'poll' && i.poll.id === 'choice1');
    expect(choice).toMatchObject({ tally: { people: 2, counts: { opta: 1, optb: 1 } } });
    const board = r.items.find((i) => i.kind === 'board');
    expect(board).toMatchObject({ board: [{ nickname: 'Person 1', rank: 1 }] });
    expect(board?.kind === 'board' && board.board[0].total).toBeGreaterThanOrEqual(500);
  });
});

describe('the store', () => {
  it('gives the newest answers when asked for a limited number, oldest first', async () => {
    const db = memoryStore();
    for (let n = 0; n < 5; n++) await db.addAnswer('s1', { pollId: 'p1', token: TOKEN(n), entry: 0, answer: { type: 'open', text: `Answer ${n}` }, at: `2026-01-01T10:0${n}:00Z` });
    expect((await db.pollAnswers('s1', 'p1', 2)).map((a) => a.answer.type === 'open' && a.answer.text)).toEqual(['Answer 3', 'Answer 4']);
    expect(await db.pollAnswers('s1', 'p1')).toHaveLength(5);
  });

  it('frees a code once its session has passed its close time, ended or not', async () => {
    const db = memoryStore();
    const s = await createSession(db, 'u1', 'Old');
    const expired: Session = { ...s, id: 'expired', code: '123456', closesAt: Math.floor(Date.now() / 1000) - 10 };
    expect(await db.createSession(expired)).toBe(true);
    expect(await db.sessionIdForCode('123456')).toBeNull();
    expect(await db.createSession({ ...s, id: 'next', code: '123456' })).toBe(true);
    expect(await db.sessionIdForCode('123456')).toBe('next');
  });

  it('saves an edit only on the state it was made from', async () => {
    const { db, s } = await running();
    await control(db, s, { action: 'lock', on: true });
    expect(await db.updateSession(s.id, { title: 'Stale' }, s.state.seq)).toBeNull();
    expect(await db.updateSession(s.id, { title: 'Fresh' }, s.state.seq + 1)).toMatchObject({ title: 'Fresh' });
  });
});

describe('the results of an interaction opened on the screen of the facilitator', () => {
  it('a poll that has stopped comes with its stored counts and written answers', async () => {
    const { db, s } = await running();
    let cur = await control(db, s, { action: 'activate', id: 'choice1' });
    await respond(db, cur, TOKEN(1), 'choice1', { optionIds: ['opta'] });
    await respond(db, cur, TOKEN(2), 'choice1', { optionIds: ['optb'] });
    cur = await control(db, cur, { action: 'activate', id: 'open1' });
    await respond(db, cur, TOKEN(1), 'open1', { text: 'More time' });
    cur = await control(db, cur, { action: 'activate', id: null });
    expect((await hostView(db, cur, 'choice1')).shown).toEqual({ id: 'choice1', tallies: { choice1: { people: 2, counts: { opta: 1, optb: 1 } } }, texts: {} });
    const open = (await hostView(db, cur, 'open1')).shown;
    expect(open?.tallies.open1.people).toBe(1);
    expect(open?.texts.open1.map((t) => t.text)).toEqual(['More time']);
    expect((await hostView(db, cur, 'rating1')).shown?.tallies).toEqual({ rating1: { people: 0, counts: {} } });
    expect((await hostView(db, cur)).shown).toBeNull();
    expect((await hostView(db, cur, 'no-such-id')).shown).toBeNull();
  });

  it('the running quiz comes with nothing extra, so the votes of an open question stay back; once closed, each question has its counts', async () => {
    const { db, s } = await running();
    let cur = await control(db, s, { action: 'activate', id: 'quiz1' });
    cur = await control(db, cur, { action: 'quiz-next' });
    await respondQuiz(db, cur, TOKEN(1), 'ques1', { optionId: 'qopb' });
    const open = await hostView(db, cur, 'quiz1');
    expect(open.shown).toBeNull();
    expect(open.tally).toEqual({ people: 1, counts: {} });
    cur = await control(db, cur, { action: 'quiz-reveal' });
    cur = await control(db, cur, { action: 'activate', id: null });
    expect((await hostView(db, cur, 'quiz1')).shown?.tallies).toEqual({ ques1: { people: 1, counts: { qopb: 1 } }, ques2: { people: 0, counts: {} } });
  });

  it('a survey comes with the counts of each of its questions, running or stopped, as they are the facilitator\'s alone', async () => {
    const { db, s } = await running();
    let cur = await control(db, s, { action: 'activate', id: 'survey1' });
    await respondSurvey(db, cur, TOKEN(1), 'survey1', { srate: { value: 4 }, sopen: { text: 'Shorter' }, spick: { optionIds: ['syes'] } });
    const tallies = { srate: { people: 1, counts: { '4': 1 } }, sopen: { people: 1, counts: {} }, spick: { people: 1, counts: { syes: 1 } } };
    expect((await hostView(db, cur, 'survey1')).shown?.tallies).toEqual(tallies);
    cur = await control(db, cur, { action: 'activate', id: null });
    const shown = (await hostView(db, cur, 'survey1')).shown;
    expect(shown?.tallies).toEqual(tallies);
    expect(shown?.texts.sopen.map((t) => t.text)).toEqual(['Shorter']);
  });
});
