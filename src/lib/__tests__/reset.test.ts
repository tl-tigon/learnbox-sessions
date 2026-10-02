import { describe, expect, it } from 'vitest';
import { control, endSession, hostView, resetInteraction, respond, respondQuiz, respondSurvey, sessionResults } from '../live';
import { running, TOKEN } from './helpers';

const refusal = async (run: Promise<unknown>) => run.then(() => null, (e: { status?: number; message: string }) => `${e.status}: ${e.message}`);

describe('resetting results', () => {
  it('deletes a poll\'s answers and counts, and leaves every other poll\'s alone', async () => {
    const { db, s: made } = await running(2);
    let s = await control(db, made, { action: 'activate', id: 'choice1' });
    await respond(db, s, TOKEN(1), 'choice1', { optionIds: ['opta'] });
    await respond(db, s, TOKEN(2), 'choice1', { optionIds: ['optb'] });
    s = await control(db, s, { action: 'activate', id: 'rating1' });
    await respond(db, s, TOKEN(1), 'rating1', { value: 4 });
    s = await control(db, s, { action: 'activate', id: null });

    await resetInteraction(db, s, 'choice1');

    expect(await db.pollAnswers(s.id, 'choice1')).toEqual([]);
    expect(await db.getTally(s.id, 'choice1')).toEqual({ people: 0, counts: {} });
    expect((await hostView(db, s)).answered).toEqual({ rating1: 1 });
    expect(await db.pollAnswers(s.id, 'rating1')).toHaveLength(1);
    const results = await sessionResults(db, s);
    const counted = results.items.flatMap((i) => (i.kind === 'poll' && i.poll.id === 'choice1' ? [i.tally.people] : []));
    expect(counted).toEqual([0]);

    /* Run again, the same person answers as if for the first time. */
    s = await control(db, s, { action: 'activate', id: 'choice1' });
    const again = await respond(db, s, TOKEN(1), 'choice1', { optionIds: ['optc'] });
    expect(again.tally).toEqual({ people: 1, counts: { optc: 1 } });
  });

  it('is refused while the poll is running, for a poll that is not there, and once the session has ended', async () => {
    const { db, s: made } = await running(1);
    const s = await control(db, made, { action: 'activate', id: 'choice1' });
    await respond(db, s, TOKEN(1), 'choice1', { optionIds: ['opta'] });
    expect(await refusal(resetInteraction(db, s, 'choice1'))).toBe('409: Stop it first');
    expect(await refusal(resetInteraction(db, s, 'nope'))).toBe('404: Not found');
    expect(await refusal(resetInteraction(db, s, undefined))).toBe('404: Not found');
    const stopped = await control(db, s, { action: 'activate', id: null });
    await endSession(db, stopped);
    expect(await refusal(resetInteraction(db, (await db.getSession(s.id))!, 'choice1'))).toBe('409: This session has ended');
    expect(await db.pollAnswers(s.id, 'choice1')).toHaveLength(1);
  });

  it('deletes every question\'s answers in a survey', async () => {
    const { db, s: made } = await running(1);
    let s = await control(db, made, { action: 'activate', id: 'survey1' });
    await respondSurvey(db, s, TOKEN(1), 'survey1', { srate: { value: 4 }, sopen: { text: 'Good pace' } });
    s = await control(db, s, { action: 'activate', id: null });
    await resetInteraction(db, s, 'survey1');
    expect(await db.pollAnswers(s.id, 'srate')).toEqual([]);
    expect(await db.pollAnswers(s.id, 'sopen')).toEqual([]);
    expect((await hostView(db, s)).answered).toEqual({});
  });

  it('a quiz loses its answers and scores and can be played again', async () => {
    const { db, s: made } = await running(1);
    let s = await control(db, made, { action: 'activate', id: 'quiz1' });
    s = await control(db, s, { action: 'quiz-next' });
    await respondQuiz(db, s, TOKEN(1), 'ques1', { optionId: 'qopb' });
    s = await control(db, s, { action: 'quiz-reveal' });
    s = await control(db, s, { action: 'quiz-next' });
    s = await control(db, s, { action: 'quiz-reveal' });
    s = await control(db, s, { action: 'quiz-board', on: true });
    expect(s.state.played).toEqual(['quiz1']);
    s = await control(db, s, { action: 'activate', id: null });

    s = await resetInteraction(db, s, 'quiz1');

    expect(s.state.played).toEqual([]);
    expect(s.state.quiz).toBeNull();
    expect(await db.listScores(s.id, 'quiz1')).toEqual([]);
    expect(await db.pollAnswers(s.id, 'ques1')).toEqual([]);
    s = await control(db, s, { action: 'activate', id: 'quiz1' });
    s = await control(db, s, { action: 'quiz-next' });
    expect(s.state.quiz).toMatchObject({ quizId: 'quiz1', index: 0 });
    const replay = await respondQuiz(db, s, TOKEN(1), 'ques1', { optionId: 'qopb' });
    expect(replay.tally.people).toBe(1);
    expect((await db.listScores(s.id, 'quiz1'))[0].total).toBeGreaterThan(0);
  });
});
