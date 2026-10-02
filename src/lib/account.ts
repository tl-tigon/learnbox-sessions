/**
 * Deleting an account's data: every session with its people, answers, questions, votes and
 * scores. The sign-in itself is removed by the browser afterwards.
 */
import type { Store } from './store/types';

export async function deleteAccountData(db: Store, ownerSub: string): Promise<{ sessions: number }> {
  const sessions = await db.listSessions(ownerSub);
  for (const summary of sessions) {
    const s = await db.getSession(summary.id);
    if (s && s.ownerSub === ownerSub) await db.deleteSession(s);
  }
  return { sessions: sessions.length };
}
