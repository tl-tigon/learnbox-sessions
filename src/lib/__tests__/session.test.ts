import { describe, expect, it } from 'vitest';
import { memoryStore } from '../store/memory';
import { applyControl, audienceView, control, createSession, duplicateSession, editSession, endSession, hostView, LiveError, respond, respondSurvey, stateEvent, wallView } from '../live';
import { checkAnswer } from '../engine/answers';
import { cleanInteractions, withNewIds } from '../engine/polls';
import { isProfane, normaliseWord } from '../engine/words';
import { LIMITS } from '../limits';
import type { ChoicePoll, Poll, Quiz, RankingPoll, Session } from '../types';
import { INTERACTIONS, running, TOKEN } from './helpers';

const polls = cleanInteractions(INTERACTIONS);
const poll = (id: string) => polls.find((p) => p.id === id) as Poll;

describe('answers', () => {
  it('choice: refuses unknown options and too many picks', () => {
    expect(checkAnswer(poll('choice1'), { optionIds: ['nope'] }).ok).toBe(false);
    expect(checkAnswer(poll('choice1'), { optionIds: ['opta', 'optb'] }).ok).toBe(false);
    expect(checkAnswer(poll('choice1'), { optionIds: ['opta'] })).toMatchObject({ ok: true, delta: { opta: 1 } });
  });
  it('rating: stays on the scale', () => {
    expect(checkAnswer(poll('rating1'), { value: 0 }).ok).toBe(false);
    expect(checkAnswer(poll('rating1'), { value: 6 }).ok).toBe(false);
    expect(checkAnswer(poll('rating1'), { value: 2.5 }).ok).toBe(false);
    expect(checkAnswer(poll('rating1'), { value: 5 })).toMatchObject({ ok: true, delta: { '5': 1 } });
  });
  it('ranking: takes every option once, and first place earns the most', () => {
    expect(checkAnswer(poll('rank1'), { order: ['rnka', 'rnkb'] }).ok).toBe(false);
    expect(checkAnswer(poll('rank1'), { order: ['rnka', 'rnka', 'rnkb'] }).ok).toBe(false);
    expect(checkAnswer(poll('rank1'), { order: ['rnka', 'rnkb', 'nope'] }).ok).toBe(false);
    expect(checkAnswer(poll('rank1'), { order: ['rnkc', 'rnka', 'rnkb'] })).toMatchObject({ ok: true, delta: { rnkc: 3, rnka: 2, rnkb: 1 } });
  });
  it('words: normalised to one form, profanity blocked', () => {
    expect(normaliseWord('  Trust. ')).toBe('trust');
    expect(normaliseWord('TRUST!!')).toBe('trust');
    expect(isProfane('sh1t')).toBe(true);
    expect(isProfane('Scunthorpe')).toBe(false);
    expect(isProfane('classic')).toBe(false);
    expect(checkAnswer(poll('cloud1'), { text: 'fuck' }).ok).toBe(false);
  });
});

describe('interactions', () => {
  it('are cleaned: unknown types dropped, ids made unique, a quiz always has a valid correct answer', () => {
    const cleaned = cleanInteractions([
      { id: 'same1', type: 'choice', title: ' Pick  one ', options: [{ id: 'dup1', label: 'A' }, { id: 'dup1', label: 'B' }], maxPicks: 9 },
      { id: 'same1', type: 'rating', title: 'Rate', max: 99 },
      { type: 'nonsense' },
      { id: 'quizz', type: 'quiz', title: 'Q', questions: [{ title: 'One?', correctId: 'missing', seconds: 7, options: [{ label: 'x' }] }] },
    ]);
    expect(cleaned.map((i) => i.type)).toEqual(['choice', 'rating', 'quiz']);
    const [choice, rating, quiz] = cleaned as [ChoicePoll, Poll, Quiz];
    expect(choice).toMatchObject({ title: 'Pick one', maxPicks: 2 });
    expect(new Set(choice.options.map((o) => o.id)).size).toBe(2);
    expect(rating.id).not.toBe(choice.id);
    expect(rating).toMatchObject({ max: 10 });
    const q = quiz.questions[0];
    expect(q.options).toHaveLength(2);
    expect(q.options.map((o) => o.id)).toContain(q.correctId);
    expect(q.seconds).toBe(20);
  });

  it('a copy has every id new and the correct answers still pointing at the same options', () => {
    const copy = withNewIds(polls);
    const ids = (list: typeof polls) => list.flatMap((i) => [i.id, ...(i.type === 'survey' ? i.polls.map((p) => p.id) : []), ...(i.type === 'quiz' ? i.questions.map((q) => q.id) : [])]);
    expect(ids(copy).some((id) => ids(polls).includes(id))).toBe(false);
    const quiz = copy.find((i) => i.type === 'quiz') as Quiz;
    expect(quiz.questions[0].options[1]).toMatchObject({ id: quiz.questions[0].correctId, label: 'Jupiter' });
    const rank = copy.find((i) => i.type === 'ranking') as RankingPoll;
    expect(rank.options.map((o) => o.label)).toEqual(['A', 'B', 'C']);
  });
});

describe('sessions', () => {
  it('a code points at one live session; ending frees it', async () => {
    const db = memoryStore();
    const s1 = await createSession(db, 'u1', 'One');
    expect(await db.sessionIdForCode(s1.code)).toBe(s1.id);
    const clash: Session = { ...s1, id: 'other' };
    expect(await db.createSession(clash)).toBe(false);
    await endSession(db, s1);
    expect(await db.sessionIdForCode(s1.code)).toBeNull();
    expect(await db.createSession(clash)).toBe(true);
  });

  it('caps live sessions per account', async () => {
    const db = memoryStore();
    for (let i = 0; i < LIMITS.liveSessionsPerAccount; i++) await createSession(db, 'u1', `S${i}`);
    await expect(createSession(db, 'u1', 'One more')).rejects.toBeInstanceOf(LiveError);
    await expect(createSession(db, 'u2', 'Mine')).resolves.toBeTruthy();
  });

  it('a duplicate carries the interactions and Q&A settings, with a new code and no answers', async () => {
    const { db, s } = await running();
    const open = await control(db, s, { action: 'activate', id: 'choice1' });
    await respond(db, open, TOKEN(1), 'choice1', { optionIds: ['opta'] });
    const copy = await duplicateSession(db, 'u1', open);
    expect(copy).toMatchObject({ title: 'Team offsite copy', status: 'live', state: { active: null, seq: 1 } });
    expect(copy.code).not.toBe(s.code);
    expect(copy.interactions.map((i) => i.type)).toEqual(s.interactions.map((i) => i.type));
    expect(await db.listTallies(copy.id)).toEqual({});
  });

  it('a control made from an old state is not applied over a newer one', async () => {
    const { db, s } = await running();
    const a = applyControl(s, { action: 'activate', id: 'choice1' });
    expect(await db.setState(s.id, a, s.state.seq)).not.toBeNull();
    const stale = applyControl(s, { action: 'lock', on: true });
    expect(await db.setState(s.id, stale, s.state.seq)).toBeNull();
    /* control() re-reads and applies on top of the latest */
    const after = await control(db, s, { action: 'lock', on: true });
    expect(after.state).toMatchObject({ active: 'choice1', locked: true, seq: s.state.seq + 2 });
  });

  it('starting a poll reopens voting; starting one that does not exist is refused', async () => {
    const { db, s } = await running();
    let cur = await control(db, s, { action: 'activate', id: 'choice1' });
    cur = await control(db, cur, { action: 'lock', on: true });
    cur = await control(db, cur, { action: 'activate', id: 'rating1' });
    expect(cur.state).toMatchObject({ active: 'rating1', locked: false });
    await expect(control(db, cur, { action: 'activate', id: 'nope' })).rejects.toThrow(/Not found/);
    cur = await control(db, cur, { action: 'activate', id: null });
    expect(cur.state.active).toBeNull();
  });

  it('edits are cleaned and reach the phones; deleting the active poll stops it; an ended session takes no edits', async () => {
    const { db, s } = await running();
    let cur = await control(db, s, { action: 'activate', id: 'choice1' });
    cur = await editSession(db, cur, { title: '  New   name ', interactions: INTERACTIONS.map((i) => (i.id === 'choice1' ? { ...i, title: 'Pick again' } : i)) });
    expect(cur.title).toBe('New name');
    expect(stateEvent(cur)).toMatchObject({ active: { kind: 'poll', poll: { title: 'Pick again' } } });
    cur = await editSession(db, cur, { interactions: INTERACTIONS.filter((i) => i.id !== 'choice1') });
    expect(cur.state.active).toBeNull();
    await endSession(db, cur);
    await expect(editSession(db, (await db.getSession(s.id))!, { title: 'Late' })).rejects.toThrow(/ended/);
  });
});

describe('answering a poll', () => {
  it('takes answers only for the poll that is started', async () => {
    const { db, s } = await running();
    await expect(respond(db, s, TOKEN(1), 'choice1', { optionIds: ['opta'] })).rejects.toThrow(/not open/);
    const open = await control(db, s, { action: 'activate', id: 'choice1' });
    await expect(respond(db, open, TOKEN(1), 'rating1', { value: 3 })).rejects.toThrow(/not open/);
    await expect(respond(db, open, TOKEN(1), 'srate', { value: 3 })).rejects.toThrow(/not open/);
    await expect(respond(db, open, TOKEN(1), 'ques1', { optionId: 'qopb' })).rejects.toThrow(/not open/);
    await expect(respond(db, open, TOKEN(1), 'choice1', { optionIds: ['opta'] })).resolves.toMatchObject({ entries: 1 });
  });

  it('refuses a locked poll, an unjoined phone and an ended session', async () => {
    const { db, s } = await running();
    const open = await control(db, s, { action: 'activate', id: 'choice1' });
    await expect(respond(db, open, TOKEN(9), 'choice1', { optionIds: ['opta'] })).rejects.toThrow(/Join/);
    const locked = await control(db, open, { action: 'lock', on: true });
    await expect(respond(db, locked, TOKEN(1), 'choice1', { optionIds: ['opta'] })).rejects.toThrow(/closed/);
    await endSession(db, locked);
    const ended = (await db.getSession(s.id))!;
    await expect(respond(db, ended, TOKEN(1), 'choice1', { optionIds: ['opta'] })).rejects.toThrow(/ended/);
  });

  it('counts one answer per person, even when sent many times at once', async () => {
    const { db, s } = await running();
    const open = await control(db, s, { action: 'activate', id: 'choice1' });
    await Promise.allSettled(Array.from({ length: 10 }, () => respond(db, open, TOKEN(1), 'choice1', { optionIds: ['opta'] })));
    expect(await db.getTally(s.id, 'choice1')).toEqual({ people: 1, counts: { opta: 1 } });
    expect(await db.pollAnswers(s.id, 'choice1')).toHaveLength(1);
  });

  it('a changed vote moves from the old option to the new one, and the person is still counted once', async () => {
    const { db, s } = await running();
    const open = await control(db, s, { action: 'activate', id: 'choice1' });
    await respond(db, open, TOKEN(1), 'choice1', { optionIds: ['opta'] });
    await respond(db, open, TOKEN(2), 'choice1', { optionIds: ['opta'] });
    await respond(db, open, TOKEN(1), 'choice1', { optionIds: ['optb'] });
    expect(await db.getTally(s.id, 'choice1')).toEqual({ people: 2, counts: { opta: 1, optb: 1 } });
    /* Sending the same answer again changes nothing. */
    await respond(db, open, TOKEN(1), 'choice1', { optionIds: ['optb'] });
    expect(await db.getTally(s.id, 'choice1')).toEqual({ people: 2, counts: { opta: 1, optb: 1 } });
    /* Many changes at once: whichever land, the counts still add up to the two people. */
    await Promise.allSettled(['opta', 'optb', 'optc', 'opta', 'optc'].map((o) => respond(db, open, TOKEN(1), 'choice1', { optionIds: [o] })));
    const t = await db.getTally(s.id, 'choice1');
    expect(t.people).toBe(2);
    expect(Object.values(t.counts).reduce((a, n) => a + n, 0)).toBe(2);
    const mine = (await db.myAnswers(s.id, 'choice1', TOKEN(1)))[0].answer as { optionIds: string[] };
    expect(t.counts[mine.optionIds[0]]).toBeGreaterThanOrEqual(1);
  });

  it('a changed vote is refused once voting is locked', async () => {
    const { db, s } = await running();
    const open = await control(db, s, { action: 'activate', id: 'rating1' });
    await respond(db, open, TOKEN(1), 'rating1', { value: 2 });
    const locked = await control(db, open, { action: 'lock', on: true });
    await expect(respond(db, locked, TOKEN(1), 'rating1', { value: 5 })).rejects.toThrow(/closed/);
    expect(await db.getTally(s.id, 'rating1')).toEqual({ people: 1, counts: { '2': 1 } });
  });

  it('ranking adds points by place, and a changed order replaces the old points', async () => {
    const { db, s } = await running();
    const open = await control(db, s, { action: 'activate', id: 'rank1' });
    await respond(db, open, TOKEN(1), 'rank1', { order: ['rnka', 'rnkb', 'rnkc'] });
    await respond(db, open, TOKEN(2), 'rank1', { order: ['rnkb', 'rnka', 'rnkc'] });
    expect(await db.getTally(s.id, 'rank1')).toEqual({ people: 2, counts: { rnka: 5, rnkb: 5, rnkc: 2 } });
    await respond(db, open, TOKEN(2), 'rank1', { order: ['rnkc', 'rnkb', 'rnka'] });
    expect(await db.getTally(s.id, 'rank1')).toEqual({ people: 2, counts: { rnka: 4, rnkb: 4, rnkc: 4 } });
  });

  it('word cloud: up to the set number of words, one person counted once', async () => {
    const { db, s } = await running();
    const open = await control(db, s, { action: 'activate', id: 'cloud1' });
    await respond(db, open, TOKEN(1), 'cloud1', { text: 'Trust' });
    await respond(db, open, TOKEN(1), 'cloud1', { text: 'trust.' });
    const last = await respond(db, open, TOKEN(1), 'cloud1', { text: 'Speed' });
    expect(last.done).toBe(true);
    await expect(respond(db, open, TOKEN(1), 'cloud1', { text: 'more' })).rejects.toThrow(/most allowed/);
    expect(await db.getTally(s.id, 'cloud1')).toEqual({ people: 1, counts: { trust: 2, speed: 1 } });
  });

  it('the people cap refuses newcomers but lets people already in come back', async () => {
    const { db, s } = await running(0);
    expect((await db.join(s.id, TOKEN(1), '', 2)).full).toBe(false);
    expect((await db.join(s.id, TOKEN(2), '', 2)).full).toBe(false);
    expect((await db.join(s.id, TOKEN(3), '', 2)).full).toBe(true);
    expect((await db.join(s.id, TOKEN(1), '', 2)).full).toBe(false);
  });
});

describe('a survey', () => {
  it('is sent in one go, checked whole before anything is stored', async () => {
    const { db, s } = await running();
    const open = await control(db, s, { action: 'activate', id: 'survey1' });
    await expect(respondSurvey(db, open, TOKEN(1), 'survey1', { srate: { value: 4 }, spick: { optionIds: ['nope'] } })).rejects.toThrow(/Again\?: Unknown option/);
    expect(await db.getTally(s.id, 'srate')).toEqual({ people: 0, counts: {} });
    await expect(respondSurvey(db, open, TOKEN(1), 'survey1', {})).rejects.toThrow(/Answer a question/);

    expect(await respondSurvey(db, open, TOKEN(1), 'survey1', { srate: { value: 4 }, sopen: { text: 'Good pace' }, spick: { optionIds: ['syes'] } })).toEqual({ answered: 3 });
    expect(await db.getTally(s.id, 'srate')).toEqual({ people: 1, counts: { '4': 1 } });
    /* Sent again with a change: the rating moves, the text answer already given stays. */
    expect(await respondSurvey(db, open, TOKEN(1), 'survey1', { srate: { value: 5 }, sopen: { text: 'Another' } })).toEqual({ answered: 1 });
    expect(await db.getTally(s.id, 'srate')).toEqual({ people: 1, counts: { '4': 0, '5': 1 } });
    expect(await db.pollAnswers(s.id, 'sopen')).toHaveLength(1);
  });

  it('takes answers only while it is the one started', async () => {
    const { db, s } = await running();
    await expect(respondSurvey(db, s, TOKEN(1), 'survey1', { srate: { value: 4 } })).rejects.toThrow(/not open/);
    const other = await control(db, s, { action: 'activate', id: 'choice1' });
    await expect(respondSurvey(db, other, TOKEN(1), 'survey1', { srate: { value: 4 } })).rejects.toThrow(/not open/);
    await expect(respondSurvey(db, other, TOKEN(1), 'choice1', { choice1: { optionIds: ['opta'] } })).rejects.toThrow(/not open/);
  });
});

describe('views', () => {
  it('phones see results only when shown; the facilitator always does; the wall follows the setting', async () => {
    const { db, s } = await running();
    let cur = await control(db, s, { action: 'activate', id: 'choice1' });
    await respond(db, cur, TOKEN(1), 'choice1', { optionIds: ['opta'] });
    cur = await control(db, cur, { action: 'results', on: false });

    const phone = await audienceView(db, cur, TOKEN(1));
    expect(phone).toMatchObject({ joined: true, active: { kind: 'poll', tally: null, mine: [{ type: 'choice', optionIds: ['opta'] }] } });
    expect((await wallView(db, cur)).tally).toEqual({ people: 1, counts: {} });
    const host = await hostView(db, cur);
    expect(host.tally).toEqual({ people: 1, counts: { opta: 1 } });
    expect(host.answered).toEqual({ choice1: 1 });
    expect(host.people).toBe(3);

    cur = await control(db, cur, { action: 'results', on: true });
    expect((await wallView(db, cur)).tally).toEqual({ people: 1, counts: { opta: 1 } });
    expect((await audienceView(db, cur, TOKEN(2))).active).toMatchObject({ tally: { people: 1 }, mine: [] });
  });

  it('nothing sent to a phone or the wall carries a token or the display key', async () => {
    const { db, s } = await running();
    const cur = await control(db, s, { action: 'activate', id: 'open1' });
    await respond(db, cur, TOKEN(1), 'open1', { text: 'Hello' });
    const seen = JSON.stringify([await audienceView(db, cur, TOKEN(2)), await wallView(db, cur), stateEvent(cur)]);
    expect(seen).not.toContain(TOKEN(1));
    expect(seen).not.toContain(cur.displayKey);
    expect((await wallView(db, cur)).texts).toMatchObject([{ text: 'Hello' }]);
  });

  it('the announcement is cleaned, capped and travels in the state', async () => {
    const { db, s } = await running();
    const cur = await control(db, s, { action: 'announce', text: `  Slides   at the end ${'x'.repeat(900)}` });
    expect(cur.state.announcement.startsWith('Slides at the end x')).toBe(true);
    expect(cur.state.announcement.length).toBe(LIMITS.announcementChars);
    expect((await audienceView(db, cur, null)).state.announcement).toBe(cur.state.announcement);
  });
});
