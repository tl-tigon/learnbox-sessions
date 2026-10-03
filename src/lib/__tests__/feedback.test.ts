import { describe, expect, it } from 'vitest';
import { FEEDBACK_FIXED, blankInteraction } from '../engine/polls';
import { PLANS } from '../limits';
import { activeForAudience, audienceView, canJoin, control, createSession, duplicateSession, editSession, endSession, hostView, joinSession, resetInteraction, respondSurvey, sessionResults, wallView } from '../live';
import { resultsCsv } from '../export';
import { memoryStore } from '../store/memory';
import type { Feedback } from '../types';
import { INTERACTIONS, TOKEN } from './helpers';

const refusal = async (run: Promise<unknown>) => run.then(() => null, (e: { status?: number; message: string }) => `${e.status}: ${e.message}`);

/** A feedback form with the fixed questions and one of the facilitator's own. */
const FORM = {
  id: 'feed1', type: 'feedback', title: 'Feedback', polls: [
    { id: 'frate', type: 'rating', title: 'How would you rate this session?', max: 5, lowLabel: 'Poor', highLabel: 'Excellent' },
    { id: 'fnote', type: 'open', title: 'Comments', maxEntries: 1 },
    { id: 'fown1', type: 'choice', title: 'Would you come again?', maxPicks: 1, options: [{ id: 'fyes', label: 'Yes' }, { id: 'fnoo', label: 'No' }] },
  ],
};
const polls = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `poll${i}`, type: 'rating', title: `Q${i}`, max: 5 }));

/** A Free account's live session holding the form, with people joined. */
async function withForm(people = 2) {
  const db = memoryStore();
  const made = await createSession(db, 'free1', 'Workshop');
  const s = await editSession(db, made, { interactions: [...polls(2), FORM] });
  for (let i = 1; i <= people; i++) await db.join(s.id, TOKEN(i), `Person ${i}`, 1000);
  return { db, s };
}

describe('the feedback form', () => {
  it('keeps its two fixed questions first, as written, whatever the facilitator sends, and holds one form per session', async () => {
    const db = memoryStore();
    const made = await createSession(db, 'free1', 'Workshop');
    const tampered = {
      ...FORM, title: 'Mine', polls: [
        { id: 'frate', type: 'choice', title: 'Changed', maxPicks: 1, options: [{ id: 'xa', label: 'A' }, { id: 'xb', label: 'B' }] },
        { id: 'fnote', type: 'rating', title: 'Also changed', max: 10 },
        FORM.polls[2],
      ],
    };
    const s = await editSession(db, made, { interactions: [tampered, { ...FORM, id: 'feed2' }] });
    expect(s.interactions).toHaveLength(1);
    const f = s.interactions[0] as Feedback;
    expect(f.type).toBe('feedback');
    expect(f.title).toBe('Feedback');
    /* The polls sent in the fixed places were of other types: they are kept as the facilitator's own, after the fixed ones. */
    expect(f.polls.slice(0, 2)).toEqual([{ id: f.polls[0].id, ...FEEDBACK_FIXED[0] }, { id: f.polls[1].id, ...FEEDBACK_FIXED[1] }]);
    expect(f.polls.slice(2).map((p) => [p.id, p.type])).toEqual([['frate', 'choice'], ['fnote', 'rating'], ['fown1', 'choice']]);
    expect(new Set(f.polls.map((p) => p.id)).size).toBe(5);

    /* Sent as the facilitator's screen sends it, the fixed questions keep their ids, so their answers stay with them. */
    const kept = await editSession(db, s, { interactions: [FORM] });
    expect((kept.interactions[0] as Feedback).polls.map((p) => p.id)).toEqual(['frate', 'fnote', 'fown1']);
    /* Removing a fixed question puts it back. */
    const cut = await editSession(db, kept, { interactions: [{ ...FORM, polls: [FORM.polls[2]] }] });
    const polls2 = (cut.interactions[0] as Feedback).polls;
    expect(polls2.map((p) => p.type)).toEqual(['rating', 'open', 'choice']);
    expect(polls2[0]).toMatchObject(FEEDBACK_FIXED[0]);
    expect(polls2[1]).toMatchObject(FEEDBACK_FIXED[1]);
    expect(polls2[2].id).toBe('fown1');
    const blank = blankInteraction('feedback') as Feedback;
    expect(blank.polls.map((p) => p.type)).toEqual(['rating', 'open']);
    expect(blank.polls[0]).toMatchObject(FEEDBACK_FIXED[0]);
  });

  it('is on Free, outside the count of polls and quizzes, and needs no Pro to start', async () => {
    const db = memoryStore();
    const made = await createSession(db, 'free1', 'Workshop');
    const full = await editSession(db, made, { interactions: [...polls(PLANS.free.interactionsPerSession), FORM] });
    expect(full.interactions).toHaveLength(PLANS.free.interactionsPerSession + 1);
    expect(await refusal(editSession(db, full, { interactions: [...polls(PLANS.free.interactionsPerSession + 1), FORM] }))).toBe(`402: Up to ${PLANS.free.interactionsPerSession} polls and quizzes in a session on Free`);
    const started = await control(db, full, { action: 'activate', id: 'feed1' });
    expect(started.state.active).toBe('feed1');
    expect((await hostView(db, started)).plan).toBe('free');
    /* A copy on Free is fine too. */
    const copy = await duplicateSession(db, 'free1', full);
    expect(copy.interactions.filter((i) => i.type === 'feedback')).toHaveLength(1);
  });

  it('takes a person\'s answers like a survey, and shows its results to the facilitator only', async () => {
    const { db, s: made } = await withForm(2);
    const s = await control(db, made, { action: 'activate', id: 'feed1' });
    expect(await respondSurvey(db, s, TOKEN(1), 'feed1', { frate: { value: 5 }, fnote: { text: 'Good pace' }, fown1: { optionIds: ['fyes'] } })).toEqual({ answered: 3 });
    expect(await respondSurvey(db, s, TOKEN(2), 'feed1', { frate: { value: 3 } })).toEqual({ answered: 1 });

    const phone = await audienceView(db, s, TOKEN(1));
    expect(phone.active).toMatchObject({ kind: 'feedback', feedback: { id: 'feed1' }, mine: { frate: [{ type: 'rating', value: 5 }] } });
    /* Another phone sees nothing of what the first one wrote, nor any count. */
    const other = await audienceView(db, s, TOKEN(2));
    expect(JSON.stringify(other)).not.toMatch(/Good pace|tally|counts/);
    const wall = await wallView(db, s);
    expect(wall.tally).toBeNull();
    expect(wall.texts).toEqual([]);
    /* The facilitator sees the running form's results, as the form may never be stopped. */
    const host = await hostView(db, s, 'feed1');
    expect(host.shown).toMatchObject({ id: 'feed1', tallies: { frate: { people: 2, counts: { '5': 1, '3': 1 } }, fown1: { people: 1, counts: { fyes: 1 } } } });
    expect(host.shown?.texts.fnote.map((t) => t.text)).toEqual(['Good pace']);
    const results = await sessionResults(db, s);
    expect(results.items.filter((i) => i.kind === 'poll' && i.group === 'Feedback')).toHaveLength(3);
  });

  it('stays open after the session ends: the code still works, people still join and answer, until the close time', async () => {
    const { db, s: made } = await withForm(1);
    const s = await control(db, made, { action: 'activate', id: 'feed1' });
    await endSession(db, s);
    const ended = (await db.getSession(s.id))!;
    expect(ended.status).toBe('ended');
    expect(canJoin(ended)).toBe(true);
    expect(await db.sessionIdForCode(s.code)).toBe(s.id);
    expect(activeForAudience(ended)).toMatchObject({ kind: 'feedback' });
    /* The code is still this session's: another session cannot take it. */
    expect(await db.createSession({ ...ended, id: 'other', status: 'live' })).toBe(false);

    /* Someone who left early joins from the link and answers. */
    const late = await joinSession(db, ended, TOKEN(9), '');
    expect(late.full).toBe(false);
    expect(await respondSurvey(db, ended, TOKEN(9), 'feed1', { frate: { value: 4 } })).toEqual({ answered: 1 });
    expect((await audienceView(db, ended, TOKEN(9))).status).toBe('ended');
    expect((await audienceView(db, ended, TOKEN(9))).active).toMatchObject({ kind: 'feedback' });
    expect((await wallView(db, ended)).active).toMatchObject({ kind: 'feedback' });

    /* Nothing else is open on an ended session. */
    expect(await refusal(control(db, ended, { action: 'lock', on: true }))).toBe('409: This session has ended');
    expect(await refusal(resetInteraction(db, ended, 'feed1'))).toBe('409: This session has ended');

    /* Past the close time, it is over. */
    const closed = { ...ended, closesAt: Math.floor(Date.now() / 1000) - 1 };
    expect(canJoin(closed)).toBe(false);
    expect(activeForAudience(closed)).toBeNull();
    expect(await refusal(respondSurvey(db, closed, TOKEN(9), 'feed1', { frate: { value: 2 } }))).toBe('409: This session has ended');
  });

  it('is closed with the session when it was not running, or when voting was closed on it', async () => {
    const { db, s: made } = await withForm(1);
    /* Stopped before the end: the code is freed and nothing takes answers. */
    let s = await control(db, made, { action: 'activate', id: 'feed1' });
    s = await control(db, s, { action: 'activate', id: null });
    await endSession(db, s);
    const ended = (await db.getSession(s.id))!;
    expect(canJoin(ended)).toBe(false);
    expect(await db.sessionIdForCode(s.code)).toBeNull();
    expect(await refusal(respondSurvey(db, ended, TOKEN(1), 'feed1', { frate: { value: 4 } }))).toBe('409: Feedback is not open');

    /* Running but locked: open to join, closed to answers. */
    const { db: db2, s: made2 } = await withForm(1);
    let t = await control(db2, made2, { action: 'activate', id: 'feed1' });
    t = await control(db2, t, { action: 'lock', on: true });
    await endSession(db2, t);
    const locked = (await db2.getSession(t.id))!;
    expect(canJoin(locked)).toBe(true);
    expect(await refusal(respondSurvey(db2, locked, TOKEN(1), 'feed1', { frate: { value: 4 } }))).toBe('409: Voting is closed');
  });

  it('is read per person: a row each with their name or Anonymous, and with names required when the facilitator asks', async () => {
    const { db, s: made } = await withForm(3);
    const s = await control(db, made, { action: 'activate', id: 'feed1' });
    await db.join(s.id, TOKEN(1), 'Asha', 1000);
    await respondSurvey(db, s, TOKEN(1), 'feed1', { frate: { value: 5 }, fnote: { text: 'Good pace' }, fown1: { optionIds: ['fyes'] } });
    await db.join(s.id, TOKEN(8), '', 1000);
    await respondSurvey(db, s, TOKEN(8), 'feed1', { frate: { value: 3 } });
    const rows = (await hostView(db, s, 'feed1')).shown?.rows;
    expect(rows).toEqual([
      { name: 'Asha', at: expect.any(String), answers: { frate: '5', fnote: 'Good pace', fown1: 'Yes' } },
      { name: 'Anonymous', at: expect.any(String), answers: { frate: '3' } },
    ]);
    const results = await sessionResults(db, s);
    const table = results.items.find((i) => i.kind === 'responses');
    expect(table).toMatchObject({ kind: 'responses', title: 'Feedback', rows });
    const csv = resultsCsv(results);
    expect(csv).toContain('"Name","How would you rate this session?","Comments","Would you come again?","Time"');
    expect(csv).toContain('"Asha","5","Good pace","Yes"');
    expect(csv).toContain('"Anonymous","3","",""');
    expect(JSON.stringify(results)).not.toContain('tok-');

    /* With names asked for, a nameless phone is refused until it gives one. */
    const named = await editSession(db, s, { interactions: s.interactions.map((i) => (i.type === 'feedback' ? { ...i, names: true } : i)) });
    expect((named.interactions.find((i) => i.type === 'feedback') as Feedback).names).toBe(true);
    await db.join(s.id, TOKEN(9), '', 1000);
    expect(await refusal(respondSurvey(db, named, TOKEN(9), 'feed1', { frate: { value: 4 } }))).toBe('400: Enter your name');
    await db.join(s.id, TOKEN(9), 'Dev', 1000);
    expect(await respondSurvey(db, named, TOKEN(9), 'feed1', { frate: { value: 4 } })).toEqual({ answered: 1 });
    expect((await hostView(db, named, 'feed1')).shown?.rows?.map((r) => r.name)).toEqual(['Asha', 'Anonymous', 'Dev']);
    /* A phone that opens the form sees whether a name is wanted, and nothing of anyone else. */
    expect((await audienceView(db, named, TOKEN(9))).active).toMatchObject({ kind: 'feedback', feedback: { names: true } });
  });

  it('can be reset like a survey, and a survey still needs Pro where the form does not', async () => {
    const { db, s: made } = await withForm(1);
    let s = await control(db, made, { action: 'activate', id: 'feed1' });
    await respondSurvey(db, s, TOKEN(1), 'feed1', { frate: { value: 5 }, fnote: { text: 'Fine' } });
    s = await control(db, s, { action: 'activate', id: null });
    await resetInteraction(db, s, 'feed1');
    expect(await db.pollAnswers(s.id, 'frate')).toEqual([]);
    expect(await db.pollAnswers(s.id, 'fnote')).toEqual([]);
    expect(await refusal(editSession(db, s, { interactions: [...s.interactions, INTERACTIONS[5]] }))).toBe('402: Surveys are on Pro');
  });
});
