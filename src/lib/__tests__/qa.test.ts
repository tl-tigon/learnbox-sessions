import { describe, expect, it } from 'vitest';
import { memoryStore } from '../store/memory';
import { control, screenView, sessionResults, startSession } from '../live';
import { ask, audienceQuestions, moderate, upvote } from '../qa';
import { cleanSlides } from '../engine/slides';
import { sortQuestions } from '../engine/questions';
import { LIMITS } from '../limits';
import type { Presentation } from '../types';

const TOKEN = (n: number) => `tok-${String(n).padStart(16, '0')}`;

function deck(qa: { moderation?: boolean; anonymous?: boolean } = {}): Presentation {
  const slides = cleanSlides([
    { id: 'qqqq1', type: 'qa', title: 'Questions', moderation: qa.moderation ?? false, anonymous: qa.anonymous ?? true },
    { id: 'aaaa2', type: 'choice', title: 'Pick', maxPicks: 1, options: [{ id: 'opta', label: 'A' }, { id: 'optb', label: 'B' }] },
  ]);
  const now = new Date().toISOString();
  return { id: 'p1', ownerSub: 'u1', title: 'Deck', slides, createdAt: now, updatedAt: now };
}

async function running(qa: Parameters<typeof deck>[0] = {}, people = 3) {
  const db = memoryStore();
  const s = await startSession(db, 'u1', deck(qa), 'presenter');
  for (let i = 1; i <= people; i++) await db.join(s.id, TOKEN(i), `Person ${i}`, 1000);
  return { db, s };
}

describe('asking', () => {
  it('a question goes live at once when moderation is off, and shows the asker’s name', async () => {
    const { db, s } = await running();
    const q = await ask(db, s, TOKEN(1), 'qqqq1', { text: '  When is  the launch? ' });
    expect(q).toMatchObject({ text: 'When is the launch?', name: 'Person 1', status: 'live', votes: 0 });
    const seen = await audienceQuestions(db, s, 'qqqq1', TOKEN(2));
    expect(seen).toMatchObject([{ id: q.id, name: 'Person 1', mine: false, voted: false }]);
    expect(seen[0]).not.toHaveProperty('token');
  });

  it('anonymous: no name when the slide allows it; a name is required when it does not', async () => {
    const open = await running({ anonymous: true });
    expect((await ask(open.db, open.s, TOKEN(1), 'qqqq1', { text: 'Why?', anonymous: true })).name).toBe('');

    const named = await running({ anonymous: false }, 0);
    await named.db.join(named.s.id, TOKEN(1), '', 1000);
    await expect(ask(named.db, named.s, TOKEN(1), 'qqqq1', { text: 'Why?', anonymous: true })).rejects.toThrow(/name/);
    const q = await ask(named.db, named.s, TOKEN(1), 'qqqq1', { text: 'Why?', anonymous: true, nickname: 'Asha' });
    expect(q.name).toBe('Asha');
    expect((await named.db.getPerson(named.s.id, TOKEN(1)))?.nickname).toBe('Asha');
  });

  it('refuses blocked words, an empty question, an unjoined phone, another slide and closed questions', async () => {
    const { db, s } = await running();
    await expect(ask(db, s, TOKEN(1), 'qqqq1', { text: 'what the fuck' })).rejects.toThrow(/blocked/);
    await expect(ask(db, s, TOKEN(1), 'qqqq1', { text: '   ' })).rejects.toThrow(/Type/);
    await expect(ask(db, s, TOKEN(9), 'qqqq1', { text: 'Hello?' })).rejects.toThrow(/Join/);
    await expect(ask(db, s, TOKEN(1), 'aaaa2', { text: 'Hello?' })).rejects.toThrow(/no questions/);
    const locked = await control(db, s, { action: 'lock', on: true });
    await expect(ask(db, locked, TOKEN(1), 'qqqq1', { text: 'Hello?' })).rejects.toThrow(/closed/);
    const moved = await control(db, locked, { action: 'next' });
    await expect(ask(db, moved, TOKEN(1), 'qqqq1', { text: 'Hello?' })).rejects.toThrow(/moved on/);
  });

  it('caps the questions one person may ask', async () => {
    const { db, s } = await running();
    for (let i = 0; i < LIMITS.questionsPerPerson; i++) await ask(db, s, TOKEN(1), 'qqqq1', { text: `Question ${i}` });
    await expect(ask(db, s, TOKEN(1), 'qqqq1', { text: 'One more' })).rejects.toThrow(/most allowed/);
    await expect(ask(db, s, TOKEN(2), 'qqqq1', { text: 'Mine' })).resolves.toBeTruthy();
  });
});

describe('upvoting', () => {
  it('one vote per person, even when sent many times at once', async () => {
    const { db, s } = await running();
    const q = await ask(db, s, TOKEN(1), 'qqqq1', { text: 'When?' });
    const sends = await Promise.allSettled(Array.from({ length: 10 }, () => upvote(db, s, TOKEN(2), 'qqqq1', q.id)));
    expect(sends.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await upvote(db, s, TOKEN(3), 'qqqq1', q.id);
    expect((await db.getQuestion(s.id, 'qqqq1', q.id))?.votes).toBe(2);
    const mine = await audienceQuestions(db, s, 'qqqq1', TOKEN(2));
    expect(mine[0]).toMatchObject({ votes: 2, voted: true });
  });

  it('only approved, unanswered questions take votes', async () => {
    const { db, s } = await running({ moderation: true });
    const q = await ask(db, s, TOKEN(1), 'qqqq1', { text: 'When?' });
    await expect(upvote(db, s, TOKEN(2), 'qqqq1', q.id)).rejects.toThrow(/Not found/);
    await moderate(db, s, 'qqqq1', q.id, 'approve');
    await expect(upvote(db, s, TOKEN(2), 'qqqq1', q.id)).resolves.toMatchObject({ votes: 1 });
    await moderate(db, s, 'qqqq1', q.id, 'answered');
    await expect(upvote(db, s, TOKEN(3), 'qqqq1', q.id)).rejects.toThrow(/answered/);
  });
});

describe('moderation', () => {
  it('a waiting question is seen by its asker and the facilitator only', async () => {
    const { db, s } = await running({ moderation: true });
    const q = await ask(db, s, TOKEN(1), 'qqqq1', { text: 'When?' });
    expect(q.status).toBe('pending');
    expect(await audienceQuestions(db, s, 'qqqq1', TOKEN(2))).toEqual([]);
    expect(await audienceQuestions(db, s, 'qqqq1', TOKEN(1))).toMatchObject([{ id: q.id, status: 'pending', mine: true }]);
    expect((await screenView(db, s)).questions).toEqual([]);
    expect((await screenView(db, s, true)).questions).toMatchObject([{ id: q.id, status: 'pending' }]);

    await moderate(db, s, 'qqqq1', q.id, 'approve');
    expect(await audienceQuestions(db, s, 'qqqq1', TOKEN(2))).toMatchObject([{ id: q.id, status: 'live' }]);
    await moderate(db, s, 'qqqq1', q.id, 'hide');
    expect(await audienceQuestions(db, s, 'qqqq1', TOKEN(1))).toEqual([]);
    expect((await screenView(db, s)).questions).toEqual([]);
  });

  it('the highlight travels in the session state and clears on hide, answered and a slide move', async () => {
    const { db, s } = await running({ moderation: true });
    const q = await ask(db, s, TOKEN(1), 'qqqq1', { text: 'When?' });
    await expect(moderate(db, s, 'qqqq1', q.id, 'highlight')).rejects.toThrow(/Approve/);
    await moderate(db, s, 'qqqq1', q.id, 'approve');
    let cur = (await moderate(db, s, 'qqqq1', q.id, 'highlight')).session;
    expect(cur.state.highlight).toBe(q.id);
    cur = (await moderate(db, cur, 'qqqq1', q.id, 'answered')).session;
    expect(cur.state.highlight).toBeNull();

    const q2 = await ask(db, cur, TOKEN(2), 'qqqq1', { text: 'Where?' });
    await moderate(db, cur, 'qqqq1', q2.id, 'approve');
    cur = (await moderate(db, cur, 'qqqq1', q2.id, 'highlight')).session;
    cur = await control(db, cur, { action: 'next' });
    expect(cur.state.highlight).toBeNull();
  });
});

describe('lists and results', () => {
  it('top puts the most votes first; recent puts the newest first', () => {
    const list = [
      { id: 'a', votes: 1, at: '2026-01-01T10:00:00Z' },
      { id: 'b', votes: 3, at: '2026-01-01T10:01:00Z' },
      { id: 'c', votes: 1, at: '2026-01-01T10:02:00Z' },
    ];
    expect(sortQuestions(list, 'top').map((q) => q.id)).toEqual(['b', 'a', 'c']);
    expect(sortQuestions(list, 'recent').map((q) => q.id)).toEqual(['c', 'b', 'a']);
  });

  it('results list every question on a Q&A slide', async () => {
    const { db, s } = await running();
    await ask(db, s, TOKEN(1), 'qqqq1', { text: 'When?' });
    await ask(db, s, TOKEN(2), 'qqqq1', { text: 'Where?', anonymous: true });
    const r = await sessionResults(db, s);
    expect(r.rows.map((x) => x.slide.id)).toEqual(['qqqq1', 'aaaa2']);
    expect(r.rows[0].questions).toMatchObject([{ text: 'When?', name: 'Person 1' }, { text: 'Where?', name: '' }]);
  });
});
