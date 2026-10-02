/**
 * Deleting an account's data: every presentation, and every session with its people, answers,
 * questions, votes and scores. The sign-in itself is removed by the browser afterwards.
 */
import type { Store } from './store/types';

export async function deleteAccountData(db: Store, ownerSub: string): Promise<{ presentations: number; sessions: number }> {
  const [presentations, sessions] = await Promise.all([db.listPresentations(ownerSub), db.listSessions(ownerSub)]);
  for (const summary of sessions) {
    const s = await db.getSession(summary.id);
    if (s && s.ownerSub === ownerSub) await db.deleteSession(s);
  }
  for (const summary of presentations) {
    const p = await db.getPresentation(summary.id);
    if (p && p.ownerSub === ownerSub) await db.deletePresentation(p);
  }
  return { presentations: presentations.length, sessions: sessions.length };
}
