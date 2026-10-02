import { memoryStore } from '../store/memory';
import { createSession, editSession } from '../live';
import type { Store } from '../store/types';
import type { Session } from '../types';

/** Puts an account on Pro the way a payment does: an order, settled. */
export async function makePro(db: Store, sub: string, days = 365) {
  const id = `order${Math.random().toString(36).slice(2)}`;
  await db.addOrder({ id, sub, amount: '588.00', days, status: 'pending', createdAt: new Date().toISOString() });
  await db.settleOrder(sub, id, 'test');
}

export const TOKEN = (n: number) => `tok-${String(n).padStart(16, '0')}`;

/** One of each kind, with fixed ids so tests can name them. */
export const INTERACTIONS = [
  { id: 'choice1', type: 'choice', title: 'Pick', maxPicks: 1, options: [{ id: 'opta', label: 'A' }, { id: 'optb', label: 'B' }, { id: 'optc', label: 'C' }] },
  { id: 'cloud1', type: 'wordcloud', title: 'One word', maxEntries: 3 },
  { id: 'rating1', type: 'rating', title: 'Rate', max: 5 },
  { id: 'open1', type: 'open', title: 'Say', maxEntries: 1 },
  { id: 'rank1', type: 'ranking', title: 'Order', options: [{ id: 'rnka', label: 'A' }, { id: 'rnkb', label: 'B' }, { id: 'rnkc', label: 'C' }] },
  {
    id: 'survey1', type: 'survey', title: 'Feedback', polls: [
      { id: 'srate', type: 'rating', title: 'Overall', max: 5 },
      { id: 'sopen', type: 'open', title: 'Why', maxEntries: 1 },
      { id: 'spick', type: 'choice', title: 'Again?', maxPicks: 1, options: [{ id: 'syes', label: 'Yes' }, { id: 'snoo', label: 'No' }] },
    ],
  },
  {
    id: 'quiz1', type: 'quiz', title: 'Planets', questions: [
      { id: 'ques1', title: 'Largest?', seconds: 20, correctId: 'qopb', options: [{ id: 'qopa', label: 'Earth' }, { id: 'qopb', label: 'Jupiter' }, { id: 'qopc', label: 'Mars' }] },
      { id: 'ques2', title: 'Closest to the sun?', seconds: 10, correctId: 'qopx', options: [{ id: 'qopx', label: 'Mercury' }, { id: 'qopy', label: 'Venus' }] },
    ],
  },
];

/** A live session with the interactions above and some people joined. Its owner is on Pro, which the survey needs. */
export async function running(people = 3, owner = 'u1', db: Store = memoryStore()): Promise<{ db: Store; s: Session }> {
  await makePro(db, owner);
  const made = await createSession(db, owner, 'Team offsite');
  const s = await editSession(db, made, { interactions: INTERACTIONS });
  for (let i = 1; i <= people; i++) await db.join(s.id, TOKEN(i), `Person ${i}`, 1000);
  return { db, s };
}
