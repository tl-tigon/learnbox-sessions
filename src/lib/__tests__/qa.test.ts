import { describe, expect, it } from 'vitest';
import { control, editSession, endSession, hostView, wallView } from '../live';
import { ask, audienceQuestions, moderate, upvote, withdraw } from '../qa';
import { sortQuestions } from '../engine/questions';
import { LIMITS } from '../limits';
import { running, TOKEN } from './helpers';

const moderated = async (people = 3) => {
  const r = await running(people);
  return { db: r.db, s: await editSession(r.db, r.s, { qa: { moderation: true, anonymous: true } }) };
};

describe('asking', () => {
  it('Q&A is open for the whole session, beside whatever poll is running', async () => {
    const { db, s } = await running();
    const q1 = await ask(db, s, TOKEN(1), { text: '  When is  the launch? ' });
    expect(q1).toMatchObject({ text: 'When is the launch?', name: 'Person 1', status: 'live', votes: 0 });
    const polling = await control(db, s, { action: 'activate', id: 'choice1' });
    await expect(ask(db, polling, TOKEN(2), { text: 'And the price?' })).resolves.toMatchObject({ status: 'live' });
    const seen = await audienceQuestions(db, polling, TOKEN(3));
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toHaveProperty('token');
  });

  it('anonymous: no name when the session allows it; a name is required when it does not', async () => {
    const open = await running();
    expect((await ask(open.db, open.s, TOKEN(1), { text: 'Why?', anonymous: true })).name).toBe('');

    const r = await running(0);
    const named = await editSession(r.db, r.s, { qa: { moderation: false, anonymous: false } });
    await r.db.join(named.id, TOKEN(1), '', 1000);
    await expect(ask(r.db, named, TOKEN(1), { text: 'Why?', anonymous: true })).rejects.toThrow(/name/);
    const q = await ask(r.db, named, TOKEN(1), { text: 'Why?', anonymous: true, nickname: 'Asha' });
    expect(q.name).toBe('Asha');
    expect((await r.db.getPerson(named.id, TOKEN(1)))?.nickname).toBe('Asha');
  });

  it('refuses blocked words, an empty question, an unjoined phone, closed questions and an ended session', async () => {
    const { db, s } = await running();
    await expect(ask(db, s, TOKEN(1), { text: 'what the fuck' })).rejects.toThrow(/blocked/);
    await expect(ask(db, s, TOKEN(1), { text: '   ' })).rejects.toThrow(/Type/);
    await expect(ask(db, s, TOKEN(9), { text: 'Hello?' })).rejects.toThrow(/Join/);
    const closed = await control(db, s, { action: 'qa-open', on: false });
    await expect(ask(db, closed, TOKEN(1), { text: 'Hello?' })).rejects.toThrow(/closed/);
    await endSession(db, closed);
    await expect(ask(db, (await db.getSession(s.id))!, TOKEN(1), { text: 'Hello?' })).rejects.toThrow(/ended/);
  });

  it('caps the questions one person may ask', async () => {
    const { db, s } = await running();
    for (let i = 0; i < LIMITS.questionsPerPerson; i++) await ask(db, s, TOKEN(1), { text: `Question ${i}` });
    await expect(ask(db, s, TOKEN(1), { text: 'One more' })).rejects.toThrow(/most allowed/);
    await expect(ask(db, s, TOKEN(2), { text: 'Mine' })).resolves.toBeTruthy();
  });
});

describe('upvoting', () => {
  it('one vote per person, even when sent many times at once; votes stay open while questions are closed', async () => {
    const { db, s } = await running();
    const q = await ask(db, s, TOKEN(1), { text: 'When?' });
    const sends = await Promise.allSettled(Array.from({ length: 10 }, () => upvote(db, s, TOKEN(2), q.id)));
    expect(sends.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const closed = await control(db, s, { action: 'qa-open', on: false });
    await upvote(db, closed, TOKEN(3), q.id);
    expect((await db.getQuestion(s.id, q.id))?.votes).toBe(2);
    expect((await audienceQuestions(db, closed, TOKEN(2)))[0]).toMatchObject({ votes: 2, voted: true });
    await expect(upvote(db, closed, TOKEN(9), q.id)).rejects.toThrow(/Join/);
  });

  it('only approved, unanswered questions take votes', async () => {
    const { db, s } = await moderated();
    const q = await ask(db, s, TOKEN(1), { text: 'When?' });
    await expect(upvote(db, s, TOKEN(2), q.id)).rejects.toThrow(/Not found/);
    await moderate(db, s, q.id, 'approve');
    await expect(upvote(db, s, TOKEN(2), q.id)).resolves.toMatchObject({ votes: 1 });
    await moderate(db, s, q.id, 'answered');
    await expect(upvote(db, s, TOKEN(3), q.id)).rejects.toThrow(/answered/);
    await moderate(db, s, q.id, 'hide');
    await expect(upvote(db, s, TOKEN(3), q.id)).rejects.toThrow(/Not found/);
  });
});

describe('moderation', () => {
  it('a waiting question is seen by its asker and the facilitator only', async () => {
    const { db, s } = await moderated();
    const q = await ask(db, s, TOKEN(1), { text: 'When?' });
    expect(q.status).toBe('pending');
    expect(await audienceQuestions(db, s, TOKEN(2))).toEqual([]);
    expect(await audienceQuestions(db, s, TOKEN(1))).toMatchObject([{ id: q.id, status: 'pending', mine: true }]);
    expect((await wallView(db, s)).questions).toEqual([]);
    expect((await hostView(db, s)).questions).toMatchObject([{ id: q.id, status: 'pending' }]);

    await moderate(db, s, q.id, 'approve');
    expect(await audienceQuestions(db, s, TOKEN(2))).toMatchObject([{ id: q.id, status: 'live' }]);
    await moderate(db, s, q.id, 'hide');
    expect(await audienceQuestions(db, s, TOKEN(1))).toEqual([]);
    expect((await wallView(db, s)).questions).toEqual([]);
  });

  it('the highlight travels in the session state and clears when the question is hidden or answered', async () => {
    const { db, s } = await moderated();
    const q = await ask(db, s, TOKEN(1), { text: 'When?' });
    await expect(moderate(db, s, q.id, 'highlight')).rejects.toThrow(/Approve/);
    await moderate(db, s, q.id, 'approve');
    let cur = (await moderate(db, s, q.id, 'highlight')).session;
    expect(cur.state.highlight).toBe(q.id);
    /* Starting a poll leaves the highlight where it is: Q&A carries on beside it. */
    cur = await control(db, cur, { action: 'activate', id: 'choice1' });
    expect(cur.state.highlight).toBe(q.id);
    cur = (await moderate(db, cur, q.id, 'answered')).session;
    expect(cur.state.highlight).toBeNull();
  });

  it('the facilitator’s replies show under the question, cleaned and capped in number', async () => {
    const { db, s } = await running();
    const q = await ask(db, s, TOKEN(1), { text: 'When?' });
    await expect(moderate(db, s, q.id, 'reply', '   ')).rejects.toThrow(/Type a reply/);
    const { question } = await moderate(db, s, q.id, 'reply', '  In   March. ');
    expect(question.replies).toMatchObject([{ text: 'In March.' }]);
    expect((await audienceQuestions(db, s, TOKEN(2)))[0].replies).toMatchObject([{ text: 'In March.' }]);
    for (let i = 1; i < LIMITS.repliesPerQuestion; i++) await moderate(db, s, q.id, 'reply', `More ${i}`);
    await expect(moderate(db, s, q.id, 'reply', 'One too many')).rejects.toThrow(/replies per question/);
  });
});

describe('lists', () => {
  it('top puts the most votes first; recent puts the newest first', () => {
    const list = [
      { id: 'a', votes: 1, at: '2026-01-01T10:00:00Z' },
      { id: 'b', votes: 3, at: '2026-01-01T10:01:00Z' },
      { id: 'c', votes: 1, at: '2026-01-01T10:02:00Z' },
    ];
    expect(sortQuestions(list, 'top').map((q) => q.id)).toEqual(['b', 'a', 'c']);
    expect(sortQuestions(list, 'recent').map((q) => q.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('taking a question back', () => {
  it('the asker can withdraw their own question; it leaves every screen and the highlight clears', async () => {
    const { db, s } = await running();
    const q = await ask(db, s, TOKEN(1), { text: 'Mine to take back?', anonymous: true });
    const lit = (await moderate(db, s, q.id, 'highlight')).session;
    expect(lit.state.highlight).toBe(q.id);
    await withdraw(db, lit, TOKEN(1), q.id);
    expect((await audienceQuestions(db, lit, TOKEN(1))).map((x) => x.id)).not.toContain(q.id);
    expect((await wallView(db, (await db.getSession(s.id))!)).questions).toHaveLength(0);
    expect((await db.getSession(s.id))!.state.highlight).toBeNull();
  });

  it('nobody else can withdraw it, and an answered question stays', async () => {
    const { db, s } = await running();
    const q = await ask(db, s, TOKEN(1), { text: 'Whose is this?', anonymous: true });
    await expect(withdraw(db, s, TOKEN(2), q.id)).rejects.toMatchObject({ status: 404 });
    await expect(withdraw(db, s, 'tok-never-joined-000', q.id)).rejects.toMatchObject({ status: 403 });
    expect((await db.getQuestion(s.id, q.id))?.status).toBe('live');
    await moderate(db, s, q.id, 'answered');
    await expect(withdraw(db, s, TOKEN(1), q.id)).rejects.toMatchObject({ status: 409 });
    expect((await db.getQuestion(s.id, q.id))?.status).toBe('answered');
  });

  it('a question waiting for review can be withdrawn by its asker', async () => {
    const { db, s } = await moderated();
    const q = await ask(db, s, TOKEN(1), { text: 'Changed my mind', anonymous: true });
    await withdraw(db, s, TOKEN(1), q.id);
    expect((await hostView(db, s)).questions.find((x) => x.id === q.id)?.status ?? 'hidden').toBe('hidden');
    await expect(withdraw(db, s, TOKEN(1), q.id)).rejects.toMatchObject({ status: 404 });
  });
});
