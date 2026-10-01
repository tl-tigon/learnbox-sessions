/**
 * The in-memory store, for local development and tests. Same guarantees as DynamoDB, kept on
 * `globalThis` so Next's dev reloads do not wipe it.
 */
import type { Presentation, Session, SessionState, Tally } from '../types';
import type { Person, Store, StoredAnswer } from './types';

interface Db {
  presentations: Map<string, Presentation>;
  sessions: Map<string, Session>;
  codes: Map<string, string>;
  people: Map<string, Map<string, Person>>;
  answers: Map<string, Map<string, StoredAnswer>>;
  tallies: Map<string, Tally>;
}

const clone = <T>(v: T): T => structuredClone(v);

export function memoryStore(db: Db = freshDb()): Store {
  const peopleOf = (sid: string) => db.people.get(sid) ?? db.people.set(sid, new Map()).get(sid)!;
  const answersOf = (sid: string) => db.answers.get(sid) ?? db.answers.set(sid, new Map()).get(sid)!;
  const akey = (a: Pick<StoredAnswer, 'slideId' | 'token' | 'entry'>) => `${a.slideId}#${a.token}#${a.entry}`;

  return {
    async listPresentations(ownerSub) {
      return [...db.presentations.values()]
        .filter((p) => p.ownerSub === ownerSub)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((p) => ({ id: p.id, title: p.title, slideCount: p.slides.length, updatedAt: p.updatedAt }));
    },
    async getPresentation(id) {
      const p = db.presentations.get(id);
      return p ? clone(p) : null;
    },
    async putPresentation(p) {
      db.presentations.set(p.id, clone(p));
    },
    async deletePresentation(p) {
      db.presentations.delete(p.id);
    },

    async createSession(s) {
      const holder = db.codes.get(s.code);
      if (holder && db.sessions.get(holder)?.status === 'live') return false;
      db.codes.set(s.code, s.id);
      db.sessions.set(s.id, clone(s));
      return true;
    },
    async getSession(id) {
      const s = db.sessions.get(id);
      return s ? clone(s) : null;
    },
    async sessionIdForCode(code) {
      return db.codes.get(code) ?? null;
    },
    async listSessions(ownerSub) {
      return [...db.sessions.values()]
        .filter((s) => s.ownerSub === ownerSub)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((s) => ({ id: s.id, code: s.code, title: s.title, status: s.status, mode: s.mode, createdAt: s.createdAt, closesAt: s.closesAt }));
    },
    async setState(id, next: SessionState, fromSeq) {
      const s = db.sessions.get(id);
      if (!s || s.status !== 'live' || s.state.seq !== fromSeq) return null;
      s.state = clone(next);
      return clone(s);
    },
    async endSession(s) {
      const cur = db.sessions.get(s.id);
      if (cur) {
        cur.status = 'ended';
        cur.endedAt = new Date().toISOString();
      }
      if (db.codes.get(s.code) === s.id) db.codes.delete(s.code);
    },

    async join(sessionId, token, nickname, cap) {
      const ppl = peopleOf(sessionId);
      const had = ppl.get(token);
      if (had) {
        if (nickname && nickname !== had.nickname) had.nickname = nickname;
        return { person: clone(had), full: false, people: ppl.size };
      }
      if (ppl.size >= cap) return { person: null, full: true, people: ppl.size };
      const person = { token, nickname, joinedAt: new Date().toISOString() };
      ppl.set(token, person);
      return { person: clone(person), full: false, people: ppl.size };
    },
    async getPerson(sessionId, token) {
      const p = peopleOf(sessionId).get(token);
      return p ? clone(p) : null;
    },
    async countPeople(sessionId) {
      return peopleOf(sessionId).size;
    },

    async addAnswer(sessionId, a) {
      const all = answersOf(sessionId);
      const k = akey(a);
      if (all.has(k)) return false;
      all.set(k, clone(a));
      return true;
    },
    async myAnswers(sessionId, slideId, token) {
      return [...answersOf(sessionId).values()].filter((a) => a.slideId === slideId && a.token === token).sort((a, b) => a.entry - b.entry).map(clone);
    },
    async slideAnswers(sessionId, slideId, limit = 500) {
      return [...answersOf(sessionId).values()].filter((a) => a.slideId === slideId).sort((a, b) => a.at.localeCompare(b.at)).slice(0, limit).map(clone);
    },

    async bumpTally(sessionId, slideId, delta, newPerson) {
      const k = `${sessionId}#${slideId}`;
      const t = db.tallies.get(k) ?? { people: 0, counts: {} };
      if (newPerson) t.people += 1;
      for (const [key, n] of Object.entries(delta)) t.counts[key] = (t.counts[key] ?? 0) + n;
      db.tallies.set(k, t);
      return clone(t);
    },
    async getTally(sessionId, slideId) {
      return clone(db.tallies.get(`${sessionId}#${slideId}`) ?? { people: 0, counts: {} });
    },
  };
}

export function freshDb(): Db {
  return { presentations: new Map(), sessions: new Map(), codes: new Map(), people: new Map(), answers: new Map(), tallies: new Map() };
}
