/**
 * The in-memory store, for local development and tests. Same guarantees as DynamoDB, kept on
 * `globalThis` so Next's dev reloads do not wipe it.
 */
import type { Question, Score, Session, SessionState, Tally } from '../types';
import type { Account, Order, Person, Store, StoredAnswer } from './types';

interface Db {
  sessions: Map<string, Session>;
  codes: Map<string, string>;
  people: Map<string, Map<string, Person>>;
  answers: Map<string, Map<string, StoredAnswer>>;
  tallies: Map<string, Map<string, Tally>>;
  questions: Map<string, Map<string, Question>>;
  upvotes: Map<string, Set<string>>;
  scores: Map<string, Map<string, Score>>;
  accounts: Map<string, Account>;
  orders: Map<string, Map<string, Order>>;
}

const clone = <T>(v: T): T => structuredClone(v);

/** The map kept for one session inside a per-session collection, made on first use. */
function of<V>(all: Map<string, V>, sessionId: string, make: () => V): V {
  let v = all.get(sessionId);
  if (!v) all.set(sessionId, (v = make()));
  return v;
}

export function memoryStore(db: Db = freshDb()): Store {
  const peopleOf = (sid: string) => of(db.people, sid, () => new Map<string, Person>());
  const answersOf = (sid: string) => of(db.answers, sid, () => new Map<string, StoredAnswer>());
  const talliesOf = (sid: string) => of(db.tallies, sid, () => new Map<string, Tally>());
  const questionsOf = (sid: string) => of(db.questions, sid, () => new Map<string, Question>());
  const upvotesOf = (sid: string) => of(db.upvotes, sid, () => new Set<string>());
  const scoresOf = (sid: string) => of(db.scores, sid, () => new Map<string, Score>());
  const ordersOf = (sub: string) => of(db.orders, sub, () => new Map<string, Order>());
  const akey = (a: Pick<StoredAnswer, 'pollId' | 'token' | 'entry'>) => `${a.pollId}#${a.token}#${a.entry}`;

  return {
    async createSession(s) {
      /* A code is free once its session has ended or passed its close time. */
      const holder = db.sessions.get(db.codes.get(s.code) ?? '');
      if (holder && holder.status === 'live' && holder.closesAt * 1000 > Date.now()) return false;
      db.codes.set(s.code, s.id);
      db.sessions.set(s.id, clone(s));
      return true;
    },
    async getSession(id) {
      const s = db.sessions.get(id);
      return s ? clone(s) : null;
    },
    async sessionIdForCode(code) {
      const id = db.codes.get(code);
      const s = id ? db.sessions.get(id) : null;
      return s && s.closesAt * 1000 > Date.now() ? s.id : null;
    },
    async listSessions(ownerSub) {
      return [...db.sessions.values()]
        .filter((s) => s.ownerSub === ownerSub)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((s) => ({ id: s.id, code: s.code, title: s.title, status: s.status, createdAt: s.createdAt, closesAt: s.closesAt, interactions: s.interactions.length }));
    },
    async updateSession(id, edit, fromSeq) {
      const s = db.sessions.get(id);
      if (!s || s.state.seq !== fromSeq) return null;
      if (edit.title !== undefined) s.title = edit.title;
      if (edit.interactions !== undefined) s.interactions = clone(edit.interactions);
      if (edit.qa !== undefined) s.qa = clone(edit.qa);
      s.rev = (s.rev ?? 1) + 1;
      return clone(s);
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
    async deleteSession(s) {
      if (db.codes.get(s.code) === s.id) db.codes.delete(s.code);
      for (const all of [db.sessions, db.people, db.answers, db.tallies, db.questions, db.upvotes, db.scores]) all.delete(s.id);
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
    async replaceAnswer(sessionId, a, prevAt) {
      const all = answersOf(sessionId);
      const k = akey(a);
      if (all.get(k)?.at !== prevAt) return false;
      all.set(k, clone(a));
      return true;
    },
    async myAnswers(sessionId, pollId, token) {
      return [...answersOf(sessionId).values()].filter((a) => a.pollId === pollId && a.token === token).sort((a, b) => a.entry - b.entry).map(clone);
    },
    async pollAnswers(sessionId, pollId, limit) {
      const all = [...answersOf(sessionId).values()].filter((a) => a.pollId === pollId).sort((a, b) => a.at.localeCompare(b.at));
      return (limit ? all.slice(-limit) : all).map(clone);
    },

    async bumpTally(sessionId, pollId, delta, people) {
      const all = talliesOf(sessionId);
      const t = all.get(pollId) ?? { people: 0, counts: {} };
      t.people += people;
      for (const [key, n] of Object.entries(delta)) t.counts[key] = (t.counts[key] ?? 0) + n;
      all.set(pollId, t);
      return clone(t);
    },
    async getTally(sessionId, pollId) {
      return clone(talliesOf(sessionId).get(pollId) ?? { people: 0, counts: {} });
    },
    async listTallies(sessionId) {
      return Object.fromEntries([...talliesOf(sessionId)].map(([id, t]) => [id, clone(t)]));
    },

    async clearAnswers(sessionId, pollIds) {
      const all = answersOf(sessionId);
      for (const [k, a] of all) if (pollIds.includes(a.pollId)) all.delete(k);
      for (const id of pollIds) talliesOf(sessionId).delete(id);
    },
    async clearScores(sessionId, quizId) {
      const all = scoresOf(sessionId);
      for (const k of [...all.keys()]) if (k.startsWith(`${quizId}#`)) all.delete(k);
    },

    async addQuestion(sessionId, q) {
      questionsOf(sessionId).set(q.id, clone(q));
    },
    async getQuestion(sessionId, id) {
      const q = questionsOf(sessionId).get(id);
      return q ? clone(q) : null;
    },
    async listQuestions(sessionId) {
      return [...questionsOf(sessionId).values()].sort((a, b) => a.id.localeCompare(b.id)).map(clone);
    },
    async setQuestionStatus(sessionId, id, status) {
      const q = questionsOf(sessionId).get(id);
      if (!q) return null;
      q.status = status;
      return clone(q);
    },
    async addReply(sessionId, id, reply, max) {
      const q = questionsOf(sessionId).get(id);
      if (!q || q.replies.length >= max) return null;
      q.replies.push(clone(reply));
      return clone(q);
    },
    async upvote(sessionId, id, token) {
      const q = questionsOf(sessionId).get(id);
      const votes = upvotesOf(sessionId);
      const k = `${token}#${id}`;
      if (!q || votes.has(k)) return null;
      votes.add(k);
      q.votes += 1;
      return clone(q);
    },
    async myUpvotes(sessionId, token) {
      const prefix = `${token}#`;
      return [...upvotesOf(sessionId)].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
    },

    async addScore(sessionId, quizId, token, nickname, questionId, points) {
      const all = scoresOf(sessionId);
      const k = `${quizId}#${token}`;
      const s = all.get(k) ?? { token, nickname, total: 0, last: 0, lastId: '' };
      const next = { ...s, nickname, total: s.total + points, last: points, lastId: questionId };
      all.set(k, next);
      return clone(next);
    },
    async listScores(sessionId, quizId) {
      const prefix = `${quizId}#`;
      return [...scoresOf(sessionId)].filter(([k]) => k.startsWith(prefix)).map(([, s]) => clone(s));
    },

    async getAccount(sub) {
      const a = db.accounts.get(sub);
      return a ? clone(a) : null;
    },
    async addOrder(o) {
      ordersOf(o.sub).set(o.id, clone(o));
    },
    async getOrder(sub, id) {
      const o = ordersOf(sub).get(id);
      return o ? clone(o) : null;
    },
    async listOrders(sub) {
      return [...ordersOf(sub).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone);
    },
    async settleOrder(sub, id, ref) {
      const o = ordersOf(sub).get(id);
      if (!o || o.status === 'paid') return null;
      const now = Math.floor(Date.now() / 1000);
      const account = { proUntil: Math.max(now, db.accounts.get(sub)?.proUntil ?? 0) + o.days * 86400 };
      o.status = 'paid';
      o.paidAt = new Date().toISOString();
      o.ref = ref;
      db.accounts.set(sub, account);
      return clone(account);
    },
    async failOrder(sub, id) {
      const o = ordersOf(sub).get(id);
      if (o?.status === 'pending') o.status = 'failed';
    },
    async deleteAccount(sub) {
      db.accounts.delete(sub);
      db.orders.delete(sub);
    },
  };
}

export function freshDb(): Db {
  return { sessions: new Map(), codes: new Map(), people: new Map(), answers: new Map(), tallies: new Map(), questions: new Map(), upvotes: new Map(), scores: new Map(), accounts: new Map(), orders: new Map() };
}
