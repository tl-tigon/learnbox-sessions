/**
 * Running a session: making it, the facilitator's edits and controls, answers, and what each
 * screen sees. Routes call these; the store keeps the data; push carries changes to screens as
 * they happen.
 */
import { canChange, checkAnswer, checkQuizAnswer, mergeDelta, recount, undo } from './engine/answers';
import { cleanInteractions, counted, findPoll, isGroup, pollIdsOf, withNewIds } from './engine/polls';
import { isShown, publicQuestion } from './engine/questions';
import { finished, forAudience, isLastQuestion, lobby, openQuestion, publicBoard, quizInPlay, quizPhase, quizPoints, rankBoard, reveal } from './engine/quiz';
import { cleanText } from './engine/words';
import { newCode, newId, newSecret } from './ids';
import { LIMITS } from './limits';
import { planName, planOf } from './plans';
import { publish } from './push/server';
import { stateChannel, tallyChannel, type ActiveForAudience, type PushEvent } from './push/events';
import type { Store } from './store/types';
import type { Answer, Feedback, Interaction, Poll, Quiz, Score, Session, SessionState, Tally } from './types';

export class LiveError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** True once a session has been ended or has passed its close time. */
export const isClosed = (s: Session) => s.status !== 'live' || s.closesAt * 1000 < Date.now();

const activeOf = (s: Session): Interaction | null => s.interactions.find((i) => i.id === s.state.active) ?? null;

/**
 * The feedback form while it takes answers: started, and the session not yet past its close time.
 * Ending the session does not close it, so people who left early can still answer that week.
 */
export function takingFeedback(s: Session): Feedback | null {
  const a = activeOf(s);
  return a?.type === 'feedback' && s.closesAt * 1000 > Date.now() ? a : null;
}

/** A phone may join a live session, or an ended one whose feedback form is still taking answers. */
export const canJoin = (s: Session) => !isClosed(s) || !!takingFeedback(s);

const title = (raw: unknown) => cleanText(typeof raw === 'string' ? raw : '').slice(0, LIMITS.titleChars) || 'Untitled';

async function claimSession(db: Store, ownerSub: string, fields: Pick<Session, 'title' | 'interactions' | 'qa'>): Promise<Session> {
  const mine = await db.listSessions(ownerSub);
  if (mine.length >= LIMITS.sessionsPerAccount) {
    throw new LiveError(409, `Up to ${LIMITS.sessionsPerAccount} sessions per account. Delete one to make another.`);
  }
  const live = mine.filter((s) => s.status === 'live' && s.closesAt * 1000 > Date.now());
  if (live.length >= LIMITS.liveSessionsPerAccount) {
    throw new LiveError(409, `Up to ${LIMITS.liveSessionsPerAccount} live sessions at once. End one to start another.`);
  }
  const now = new Date();
  for (let attempt = 0; attempt < 8; attempt++) {
    const s: Session = {
      id: newId(),
      code: newCode(),
      ownerSub,
      ...fields,
      status: 'live',
      state: { active: null, showResults: true, locked: false, qaOpen: true, announcement: '', seq: 1 },
      displayKey: newSecret(),
      createdAt: now.toISOString(),
      closesAt: Math.floor(now.getTime() / 1000) + LIMITS.sessionDays * 86400,
    };
    if (await db.createSession(s)) return s;
  }
  throw new LiveError(503, 'Try again');
}

export const createSession = (db: Store, ownerSub: string, rawTitle: unknown) =>
  claimSession(db, ownerSub, { title: title(rawTitle), interactions: [], qa: { moderation: false, anonymous: true } });

/** A plan refuses with 402, which the facilitator's screens read as "this needs Pro". */
const needsPro = (message: string) => new LiveError(402, message);

/**
 * A new session with the same polls, quizzes, surveys and Q&A settings, and none of the answers.
 * The copy must fit the account's plan as it is now.
 */
export async function duplicateSession(db: Store, ownerSub: string, source: Session) {
  const plan = await planOf(db, ownerSub);
  if (counted(source.interactions).length > plan.interactionsPerSession || (!plan.surveys && source.interactions.some((i) => i.type === 'survey'))) {
    throw needsPro('A copy of this session needs Pro');
  }
  return claimSession(db, ownerSub, { title: `${source.title} copy`.slice(0, LIMITS.titleChars), interactions: withNewIds(source.interactions), qa: { ...source.qa } });
}

/** A quiz that has started keeps its questions: changing them would change what the scores mean. */
const quizStarted = (s: Session, quizId: string) => s.state.played?.includes(quizId) || (s.state.quiz?.quizId === quizId && s.state.quiz.index >= 0);

/**
 * Saves the facilitator's edits to the title, the interactions and the Q&A settings. The edit is
 * worked out against one live state and saved only if that state still stands; if a control
 * landed in between (a quiz starting, say), it is worked out again on the new state.
 */
export async function editSession(db: Store, s: Session, raw: Record<string, unknown>): Promise<Session> {
  let cur = s;
  const plan = Array.isArray(raw.interactions) ? await planOf(db, s.ownerSub) : null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (isClosed(cur)) throw new LiveError(409, 'This session has ended');
    /* An edit carries the revision it was made from. A session edited since, in another window, is not overwritten. */
    if (typeof raw.rev === 'number' && raw.rev !== (cur.rev ?? 1)) throw new LiveError(409, 'This session was changed in another window. Reload to edit it.');
    const edit: Parameters<Store['updateSession']>[1] = {};
    if (typeof raw.title === 'string') edit.title = title(raw.title);
    if (Array.isArray(raw.interactions)) {
      const session = cur;
      edit.interactions = cleanInteractions(raw.interactions).map((i) => {
        const stored = session.interactions.find((x) => x.id === i.id);
        return i.type === 'quiz' && stored?.type === 'quiz' && quizStarted(session, i.id) ? stored : i;
      });
      /* What the plan holds. A session made on Pro keeps what it has after Pro ends, and takes no more. The feedback form is outside the count. */
      if (plan && counted(edit.interactions).length > plan.interactionsPerSession && counted(edit.interactions).length > counted(session.interactions).length) {
        throw needsPro(`Up to ${plan.interactionsPerSession} polls and quizzes in a session on Free`);
      }
      if (plan && !plan.surveys && edit.interactions.some((i) => i.type === 'survey' && !session.interactions.some((x) => x.id === i.id && x.type === 'survey'))) {
        throw needsPro('Surveys are on Pro');
      }
      /* One database row holds them all, and a row has a size limit. */
      if (JSON.stringify(edit.interactions).length > LIMITS.sessionBytes) throw new LiveError(413, 'This session holds too much. Remove a poll.');
    }
    if (raw.qa && typeof raw.qa === 'object') {
      const qa = raw.qa as Record<string, unknown>;
      edit.qa = { moderation: qa.moderation === true, anonymous: qa.anonymous !== false };
    }
    const saved = await db.updateSession(cur.id, edit, cur.state.seq);
    /* Phones holding the active poll need its new wording, and whatever pointed at a deleted interaction must let go. */
    if (saved) return control(db, saved, { action: 'touch' });
    const fresh = await db.getSession(cur.id);
    if (!fresh) throw new LiveError(404, 'Not found');
    cur = fresh;
  }
  throw new LiveError(409, 'Try again');
}

export type ControlAction =
  | { action: 'activate'; id: string | null }
  | { action: 'results'; on: boolean }
  | { action: 'lock'; on: boolean }
  | { action: 'qa-open'; on: boolean }
  | { action: 'announce'; text: string }
  | { action: 'highlight'; id: string | null }
  | { action: 'quiz-next' }
  | { action: 'quiz-reveal' }
  | { action: 'quiz-board'; on: boolean }
  | { action: 'touch' }
  | { action: 'forget-quiz'; id: string };

export const CONTROL_ACTIONS = ['activate', 'results', 'lock', 'qa-open', 'announce', 'quiz-next', 'quiz-reveal', 'quiz-board'];

/** The state after a control. `now` is the server's clock, which times quiz questions. */
export function applyControl(s: Session, a: ControlAction, now = Date.now()): SessionState {
  const st = s.state;
  const next = (patch: Partial<SessionState>): SessionState => ({ ...st, ...patch, seq: st.seq + 1 });
  const playing = (): { quiz: Quiz; q: NonNullable<SessionState['quiz']> } => {
    const quiz = activeOf(s);
    const inPlay = quiz?.type === 'quiz' ? quizInPlay(st, quiz) : null;
    if (quiz?.type !== 'quiz' || !inPlay || (inPlay.q.index >= 0 && !inPlay.question)) throw new LiveError(409, 'Start the quiz first');
    return { quiz, q: inPlay.q };
  };

  switch (a.action) {
    case 'activate': {
      if (a.id === null) return next({ active: null, locked: false });
      const target = s.interactions.find((i) => i.id === a.id);
      if (!target) throw new LiveError(404, 'Not found');
      if (target.type !== 'quiz') return next({ active: target.id, locked: false });
      /* Coming back to the quiz in play resumes it. Another quiz left unfinished counts as played. */
      if (st.quiz?.quizId === target.id) return next({ active: target.id, locked: false });
      const abandoned = st.quiz && st.quiz.index >= 0 && !st.played?.includes(st.quiz.quizId) ? [st.quiz.quizId] : [];
      const played = [...(st.played ?? []), ...abandoned];
      return next({ active: target.id, locked: false, played, quiz: played.includes(target.id) ? finished(target) : lobby(target) });
    }
    case 'results': return next({ showResults: !!a.on });
    case 'lock': return next({ locked: !!a.on });
    case 'qa-open': return next({ qaOpen: !!a.on });
    case 'announce': return next({ announcement: cleanText(typeof a.text === 'string' ? a.text : '').slice(0, LIMITS.announcementChars) });
    case 'highlight': return next({ highlight: a.id });
    case 'quiz-next': {
      const { quiz, q } = playing();
      const phase = quizPhase(q, now);
      if (phase === 'lobby') return next({ quiz: openQuestion(quiz, 0, now) });
      if (phase === 'open' || phase === 'closed') throw new LiveError(409, 'Reveal the answer first');
      if (isLastQuestion(quiz, q)) throw new LiveError(409, 'That was the last question');
      return next({ quiz: openQuestion(quiz, q.index + 1, now) });
    }
    case 'quiz-reveal': {
      const { quiz, q } = playing();
      const phase = quizPhase(q, now);
      if (phase !== 'open' && phase !== 'closed') throw new LiveError(409, phase === 'lobby' ? 'Start the quiz first' : 'The answer is already revealed');
      return next({ quiz: reveal(quiz, q, now) });
    }
    case 'quiz-board': {
      const { quiz, q } = playing();
      if (!q.revealed) throw new LiveError(409, 'Reveal the answer first');
      /* The leaderboard after the last question ends the quiz. */
      const played = a.on && isLastQuestion(quiz, q) && !st.played?.includes(quiz.id) ? [...(st.played ?? []), quiz.id] : st.played;
      return next({ quiz: { ...q, board: !!a.on }, played });
    }
    /* After a reset: the quiz counts as never played, so it can be played again. */
    case 'forget-quiz': return next({ played: st.played?.filter((id) => id !== a.id), quiz: st.quiz?.quizId === a.id ? null : st.quiz });
    case 'touch': {
      /* After an edit: nothing in the state may point at an interaction that is no longer there. */
      const quizIds = new Set(s.interactions.filter((i) => i.type === 'quiz').map((i) => i.id));
      return next({
        active: activeOf(s) ? st.active : null,
        quiz: st.quiz && quizIds.has(st.quiz.quizId) ? st.quiz : null,
        played: st.played?.filter((id) => quizIds.has(id)),
      });
    }
  }
}

/**
 * The active interaction as phones and the big screen receive it: a quiz question without its
 * answer. Once the session is closed, only a feedback form still taking answers is active.
 */
export function activeForAudience(s: Session): ActiveForAudience | null {
  const a = isClosed(s) ? takingFeedback(s) : activeOf(s);
  if (!a) return null;
  if (a.type === 'survey') return { kind: 'survey', survey: a };
  if (a.type === 'feedback') return { kind: 'feedback', feedback: a };
  if (a.type !== 'quiz') return { kind: 'poll', poll: a };
  const inPlay = quizInPlay(s.state, a);
  return { kind: 'quiz', id: a.id, title: a.title, count: a.questions.length, question: inPlay?.question ? forAudience(inPlay.question) : null };
}

export function stateEvent(s: Session): PushEvent {
  return { kind: 'state', seq: s.state.seq, status: isClosed(s) ? 'ended' : 'live', state: s.state, active: activeForAudience(s), now: Date.now() };
}

/** Applies a control on top of the latest state, retrying if another control landed first. */
export async function control(db: Store, s: Session, a: ControlAction): Promise<Session> {
  let cur = s;
  if (a.action === 'activate' && s.interactions.find((i) => i.id === a.id)?.type === 'survey' && !(await planOf(db, s.ownerSub)).surveys) {
    throw needsPro('Surveys are on Pro');
  }
  for (let i = 0; i < 4; i++) {
    if (isClosed(cur)) throw new LiveError(409, 'This session has ended');
    const next = applyControl(cur, a);
    const saved = await db.setState(cur.id, next, cur.state.seq);
    if (saved) {
      await publish(stateChannel(saved.id), stateEvent(saved));
      /* Until now screens had only the number who answered; the reveal sends how people voted. */
      const q = saved.state.quiz;
      const quiz = a.action === 'quiz-reveal' && q ? saved.interactions.find((x) => x.id === q.quizId) : null;
      const pollId = quiz?.type === 'quiz' && q ? quiz.questions[q.index]?.id : undefined;
      if (pollId) await publish(tallyChannel(saved.id, pollId), { kind: 'tally', pollId, tally: await db.getTally(saved.id, pollId) });
      return saved;
    }
    const fresh = await db.getSession(cur.id);
    if (!fresh) throw new LiveError(404, 'Session not found');
    cur = fresh;
  }
  throw new LiveError(409, 'Try again');
}

/**
 * Deletes the answers of one poll, quiz or survey, so it can be run again from nothing. It must
 * be stopped first: nothing can arrive while its answers are being deleted. A quiz also loses
 * its scores and can be played again.
 */
export async function resetInteraction(db: Store, s: Session, id: unknown): Promise<Session> {
  if (isClosed(s)) throw new LiveError(409, 'This session has ended');
  const i = s.interactions.find((x) => x.id === id);
  if (!i) throw new LiveError(404, 'Not found');
  if (s.state.active === i.id) throw new LiveError(409, 'Stop it first');
  const after = i.type === 'quiz' ? await control(db, s, { action: 'forget-quiz', id: i.id }) : s;
  await db.clearAnswers(s.id, pollIdsOf(i));
  if (i.type === 'quiz') await db.clearScores(s.id, i.id);
  return after;
}

/** Ends the session. Its code is freed, unless the feedback form is still taking answers: then the code keeps working for it until the close time. */
export async function endSession(db: Store, s: Session): Promise<void> {
  await db.endSession(s, !!takingFeedback(s));
  await publish(stateChannel(s.id), stateEvent({ ...s, status: 'ended' }));
}

/** Adds a phone to the session, or finds it again. How many people a session holds is set by its owner's plan. */
export async function joinSession(db: Store, s: Session, token: string, nickname: string) {
  return db.join(s.id, token, nickname, (await planOf(db, s.ownerSub)).peoplePerSession);
}

/** A quiz question's counts while it is open: how many answered, and nothing about which option. */
const answeredOnly = (t: Tally): Tally => ({ people: t.people, counts: {} });

async function joined(db: Store, s: Session, token: string) {
  const person = await db.getPerson(s.id, token);
  if (!person) throw new LiveError(403, 'Join the session first');
  return person;
}

/**
 * A write that follows a stored answer and must land with it: the counts, a score. It is tried a
 * few times before giving up. These are plain writes, not a transaction with the answer, because
 * a whole room writes to the same counts row at once and transactions on one row collide. The
 * stored answers stay the truth: results are counted again from them.
 */
async function surely<T>(write: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await write();
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((done) => setTimeout(done, 40 * 2 ** attempt));
    }
  }
}

/** `tally` is what the person who answered may be shown: the full counts, or only how many answered when results are held back. */
export interface Responded { tally: Tally; entries: number; done: boolean }

/** Stores one checked answer to a poll and adds it to the counts. A changeable answer replaces the person's earlier one. */
async function record(db: Store, s: Session, token: string, poll: Poll, raw: unknown, inSurvey: boolean): Promise<Responded> {
  const c = checkAnswer(poll, raw);
  if (!c.ok) throw new LiveError(400, c.error);
  const at = new Date().toISOString();
  let tally: Tally;
  let entry = 0;

  if (canChange(poll)) {
    const [had] = await db.myAnswers(s.id, poll.id, token);
    if (!had) {
      if (!(await db.addAnswer(s.id, { pollId: poll.id, token, entry: 0, answer: c.answer, at }))) throw new LiveError(409, 'Try again');
      tally = await surely(() => db.bumpTally(s.id, poll.id, c.delta, 1));
    } else {
      /* A change takes the old answer out of the counts and puts the new one in, in one update. */
      const change = mergeDelta(undo(had.answer), c.delta);
      if (!Object.keys(change).length) tally = await db.getTally(s.id, poll.id);
      else {
        if (!(await db.replaceAnswer(s.id, { pollId: poll.id, token, entry: 0, answer: c.answer, at }, had.at))) throw new LiveError(409, 'Try again');
        tally = await surely(() => db.bumpTally(s.id, poll.id, change, 0));
      }
    }
  } else {
    /* Take the first free entry. Entry 0 is the person's first answer to this poll, which is
       what counts them as one more person who answered. */
    entry = -1;
    for (let n = 0; n < c.maxEntries; n++) {
      if (await db.addAnswer(s.id, { pollId: poll.id, token, entry: n, answer: c.answer, at })) {
        entry = n;
        break;
      }
    }
    if (entry < 0) throw new LiveError(409, c.maxEntries > 1 ? 'You have sent the most allowed' : 'You have already answered');
    const first = entry === 0 ? 1 : 0;
    tally = await surely(() => db.bumpTally(s.id, poll.id, c.delta, first));
  }

  /* Every phone can listen to this channel. While results are hidden, and for a survey or the
     feedback form, only the number who answered goes out; the facilitator's screen reloads to get the rest. */
  const withheld = inSurvey || !s.state.showResults;
  const shown = withheld ? answeredOnly(tally) : tally;
  const text = !withheld && c.answer.type === 'open' ? c.answer.text : undefined;
  await publish(tallyChannel(s.id, poll.id), { kind: 'tally', pollId: poll.id, tally: shown, text, at, ...(withheld ? { withheld } : {}) });
  return { tally: shown, entries: entry + 1, done: entry + 1 >= c.maxEntries };
}

/** An answer to the poll the facilitator has started. */
export async function respond(db: Store, s: Session, token: string, pollId: string, raw: unknown): Promise<Responded> {
  if (isClosed(s)) throw new LiveError(409, 'This session has ended');
  const found = findPoll(s.interactions, pollId);
  if (!found || found.parent.id !== s.state.active) throw new LiveError(409, 'This poll is not open');
  if (s.state.locked) throw new LiveError(409, 'Voting is closed');
  await joined(db, s, token);
  return record(db, s, token, found.poll, raw, isGroup(found.parent));
}

/**
 * A survey or the feedback form sent in one go: an answer for each poll the person filled in.
 * Everything is checked before anything is stored, so it is never half saved because of one bad
 * answer. The feedback form takes answers after the session has ended, until its close time.
 */
export async function respondSurvey(db: Store, s: Session, token: string, surveyId: string, raw: unknown): Promise<{ answered: number }> {
  const survey = s.interactions.find((i) => i.id === surveyId);
  if (!survey || !isGroup(survey) || s.state.active !== surveyId) throw new LiveError(409, survey?.type === 'feedback' ? 'Feedback is not open' : 'This survey is not open');
  if (survey.type === 'feedback' ? !takingFeedback(s) : isClosed(s)) throw new LiveError(409, 'This session has ended');
  if (s.state.locked) throw new LiveError(409, 'Voting is closed');
  await joined(db, s, token);

  const answers = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const filled = survey.polls.filter((p) => answers[p.id] !== undefined && answers[p.id] !== null);
  if (!filled.length) throw new LiveError(400, 'Answer a question');
  for (const p of filled) {
    const c = checkAnswer(p, answers[p.id]);
    if (!c.ok) throw new LiveError(400, `${p.title || 'Question'}: ${c.error}`);
  }
  let answered = 0;
  for (const p of filled) {
    try {
      await record(db, s, token, p, answers[p.id], true);
      answered += 1;
    } catch (e) {
      /* Sent before: a word or a text answer the person has already given is left as it is. */
      if (!(e instanceof LiveError && e.status === 409 && /already|most allowed/.test(e.message))) throw e;
    }
  }
  return { answered };
}

/** An answer to the quiz question in play. It is timed here, on arrival, against the moment the server opened the question. */
export async function respondQuiz(db: Store, s: Session, token: string, questionId: string, raw: unknown): Promise<Responded> {
  if (isClosed(s)) throw new LiveError(409, 'This session has ended');
  const quiz = activeOf(s);
  const inPlay = quiz?.type === 'quiz' ? quizInPlay(s.state, quiz) : null;
  if (quiz?.type !== 'quiz' || !inPlay) throw new LiveError(409, 'This quiz is not open');
  const now = Date.now();
  const phase = quizPhase(inPlay.q, now);
  const question = inPlay.question;
  if (phase === 'lobby' || !question) throw new LiveError(409, 'The question has not started');
  if (question.id !== questionId) throw new LiveError(409, 'That question is over');
  if (phase !== 'open') throw new LiveError(409, 'Time is up');
  const person = await joined(db, s, token);
  if (!person.nickname) throw new LiveError(400, 'Enter your name');

  const c = checkQuizAnswer(question, raw);
  if (!c.ok || c.answer.type !== 'quiz') throw new LiveError(400, c.ok ? 'Pick an option' : c.error);
  const points = quizPoints(c.answer.optionId === question.correctId, now - inPlay.q.openedAt, question.seconds);
  const at = new Date(now).toISOString();
  if (!(await db.addAnswer(s.id, { pollId: question.id, token, entry: 0, answer: c.answer, at, points }))) throw new LiveError(409, 'You have already answered');

  const tally = answeredOnly(await surely(() => db.bumpTally(s.id, question.id, c.delta, 1)));
  await surely(() => db.addScore(s.id, quiz.id, token, person.nickname, question.id, points));
  await publish(tallyChannel(s.id, question.id), { kind: 'tally', pollId: question.id, tally, at });
  return { tally, entries: 1, done: true };
}

/*
 * A quiz's leaderboard, worked out from every player's score. Scores only change while a question
 * is open, and nobody is shown the board then, so a short memo saves reading up to 1,000 rows for
 * each phone that asks at the same moment.
 */
const boards = new Map<string, { at: number; board: ReturnType<typeof rankBoard> }>();
async function boardOf(db: Store, s: Session, quiz: Quiz) {
  const key = `${s.id}:${quiz.id}:${s.state.seq}`;
  const hit = boards.get(key);
  if (hit && Date.now() - hit.at < 3000) return hit.board;
  const q = s.state.quiz?.quizId === quiz.id ? s.state.quiz : null;
  const latest = q && q.index >= 0 ? quiz.questions[q.index]?.id ?? null : null;
  const board = rankBoard(await db.listScores(s.id, quiz.id), latest);
  if (boards.size > 200) boards.clear();
  boards.set(key, { at: Date.now(), board });
  return board;
}

/** What a phone sees. Nothing here is more than the audience may know at this moment. */
export async function audienceView(db: Store, s: Session, token: string | null) {
  const now = Date.now();
  const person = token ? await db.getPerson(s.id, token) : null;
  const base = {
    id: s.id, code: s.code, title: s.title, status: isClosed(s) ? ('ended' as const) : ('live' as const),
    state: s.state, qa: s.qa, serverNow: now, joined: !!person, nickname: person?.nickname ?? '',
  };
  const active = activeForAudience(s);
  if (!active) return { ...base, active: null };

  if (active.kind === 'poll') {
    const mine = person ? await db.myAnswers(s.id, active.poll.id, token!) : [];
    const tally = s.state.showResults ? await db.getTally(s.id, active.poll.id) : null;
    return { ...base, active: { ...active, mine: mine.map((m) => m.answer), tally } };
  }
  if (active.kind === 'survey' || active.kind === 'feedback') {
    const mine: Record<string, Answer[]> = {};
    const polls = active.kind === 'survey' ? active.survey.polls : active.feedback.polls;
    if (person) {
      await Promise.all(polls.map(async (p) => {
        const got = await db.myAnswers(s.id, p.id, token!);
        if (got.length) mine[p.id] = got.map((m) => m.answer);
      }));
    }
    return { ...base, active: { ...active, mine } };
  }

  /* Quiz: the players in the lobby, then this person's points and place once the answer is revealed. */
  const quiz = activeOf(s) as Quiz;
  const q = quizInPlay(s.state, quiz)?.q;
  if (!q) return { ...base, active: { ...active, mine: [], people: await db.countPeople(s.id), me: undefined, top: undefined } };
  const phase = quizPhase(q, now);
  const mine = person && active.question ? await db.myAnswers(s.id, active.question.id, token!) : [];
  const scored = phase === 'revealed' || phase === 'board';
  const board = scored ? await boardOf(db, s, quiz) : null;
  const place = board?.find((e) => e.token === token);
  return {
    ...base,
    active: {
      ...active,
      mine: mine.map((m) => m.answer),
      people: await db.countPeople(s.id),
      me: board ? { rank: place?.rank ?? null, total: place?.total ?? 0, last: place?.last ?? 0, players: board.length } : undefined,
      top: board && phase === 'board' && isLastQuestion(quiz, q) ? publicBoard(board, 3) : undefined,
    },
  };
}

/** The counts and answers the big screen may show for the active interaction right now. */
async function activeResults(db: Store, s: Session, now: number) {
  const a = activeOf(s);
  if (!a || isGroup(a)) return { tally: null, texts: [], board: null };
  if (a.type === 'quiz') {
    const inPlay = quizInPlay(s.state, a);
    if (!inPlay) return { tally: null, texts: [], board: null };
    const phase = quizPhase(inPlay.q, now);
    const raw = inPlay.question ? await db.getTally(s.id, inPlay.question.id) : null;
    const board = phase === 'board' ? await boardOf(db, s, a) : null;
    return {
      tally: raw && phase === 'open' ? answeredOnly(raw) : raw,
      texts: [],
      board: board && { entries: publicBoard(board, LIMITS.boardSize), players: board.length, final: isLastQuestion(a, inPlay.q) },
    };
  }
  const [tally, recent] = await Promise.all([db.getTally(s.id, a.id), a.type === 'open' ? db.pollAnswers(s.id, a.id, 500) : Promise.resolve([])]);
  return { tally, texts: recent.map((r) => ({ text: r.answer.type === 'open' ? r.answer.text : '', at: r.at })), board: null };
}

/**
 * What the big screen shows. It is opened by the facilitator or, on a projector PC that is not
 * signed in, with the display key, so it carries only what the audience may see.
 */
export async function wallView(db: Store, s: Session) {
  const now = Date.now();
  const [people, results, questions] = await Promise.all([db.countPeople(s.id), activeResults(db, s, now), db.listQuestions(s.id)]);
  const hidden = !s.state.showResults && activeOf(s)?.type !== 'quiz';
  return {
    id: s.id, code: s.code, title: s.title, status: isClosed(s) ? ('ended' as const) : ('live' as const),
    state: s.state, serverNow: now, people,
    active: activeForAudience(s),
    tally: results.tally && hidden ? answeredOnly(results.tally) : results.tally,
    texts: hidden ? [] : results.texts,
    board: results.board,
    questions: questions.filter((q) => isShown(q.status)).map(publicQuestion),
  };
}

/**
 * The stored counts of an interaction the facilitator has open: a poll's own, or those of each
 * question of a quiz, survey or feedback form. A running poll or quiz is left out; its counts
 * come with the view, held back where the audience's are. A running survey or feedback form is
 * included: its results are the facilitator's alone, and the feedback form may never stop.
 */
async function shownResults(db: Store, s: Session, id: string | null, tallies: Record<string, Tally>) {
  const i = id ? s.interactions.find((x) => x.id === id) : undefined;
  if (!i || (i.id === s.state.active && !isGroup(i))) return null;
  const polls = i.type === 'quiz' ? i.questions.map((q) => ({ id: q.id, open: false })) : (isGroup(i) ? i.polls : [i]).map((p) => ({ id: p.id, open: p.type === 'open' }));
  const texts: Record<string, { text: string; at: string }[]> = {};
  await Promise.all(polls.filter((p) => p.open).map(async (p) => {
    texts[p.id] = (await db.pollAnswers(s.id, p.id, 500)).map((r) => ({ text: r.answer.type === 'open' ? r.answer.text : '', at: r.at }));
  }));
  return { id: i.id, tallies: Object.fromEntries(polls.map((p) => [p.id, tallies[p.id] ?? { people: 0, counts: {} }])), texts };
}

/**
 * What the facilitator's screen sees: everything in the session, including questions that wait
 * for approval. `show` is the interaction open on that screen; its stored results come along.
 */
export async function hostView(db: Store, s: Session, show: string | null = null) {
  const now = Date.now();
  const [people, results, questions, tallies, account] = await Promise.all([db.countPeople(s.id), activeResults(db, s, now), db.listQuestions(s.id), db.listTallies(s.id), db.getAccount(s.ownerSub)]);
  return {
    plan: planName(account),
    shown: await shownResults(db, s, show, tallies),
    id: s.id, code: s.code, title: s.title, status: isClosed(s) ? ('ended' as const) : ('live' as const),
    state: s.state, serverNow: now, people, closesAt: s.closesAt, createdAt: s.createdAt, displayKey: s.displayKey, rev: s.rev ?? 1,
    qa: s.qa,
    interactions: s.interactions,
    /* How many have answered each poll and quiz question, for the list. */
    answered: Object.fromEntries(Object.entries(tallies).map(([id, t]) => [id, t.people])),
    tally: results.tally,
    texts: results.texts,
    board: results.board,
    questions: questions.map(publicQuestion),
  };
}

/**
 * Full results of a session, interaction by interaction, for the results page and export. They
 * are counted afresh from the stored answers, which are the truth; the live counts are only a
 * running copy. People's tokens stay here.
 */
export async function sessionResults(db: Store, s: Session) {
  const pollResult = async (poll: Poll, group: string | null) => {
    const answers = await db.pollAnswers(s.id, poll.id);
    return { kind: 'poll' as const, group, poll, tally: recount(answers), answers: poll.type === 'open' ? answers.map((a) => ({ answer: a.answer, at: a.at })) : [] };
  };
  const quizResult = async (quiz: Quiz) => {
    const perQuestion = await Promise.all(quiz.questions.map((question) => db.pollAnswers(s.id, question.id)));
    const questions = quiz.questions.map((question, n) => ({ kind: 'quiz-question' as const, quiz: quiz.title || 'Quiz', question, tally: recount(perQuestion[n]) }));
    /* Each player's total is the sum of the points their answers earned; the score rows supply the names. */
    const names = new Map((await db.listScores(s.id, quiz.id)).map((x) => [x.token, x.nickname]));
    const totals = new Map<string, number>();
    for (const a of perQuestion.flat()) totals.set(a.token, (totals.get(a.token) ?? 0) + (a.points ?? 0));
    const scores: Score[] = await Promise.all([...totals].map(async ([token, total]) => (
      { token, nickname: names.get(token) ?? (await db.getPerson(s.id, token))?.nickname ?? '', total, last: 0, lastId: '' }
    )));
    return [...questions, { kind: 'board' as const, quiz: quiz.title || 'Quiz', board: publicBoard(rankBoard(scores, null), LIMITS.peoplePerSession) }];
  };
  const items = (await Promise.all(s.interactions.map(async (i) => {
    if (isGroup(i)) return Promise.all(i.polls.map((p) => pollResult(p, i.type === 'feedback' ? i.title : i.title || 'Survey')));
    if (i.type !== 'quiz') return [await pollResult(i, null)];
    return quizResult(i);
  }))).flat();
  return {
    session: { id: s.id, code: s.code, title: s.title, createdAt: s.createdAt, status: isClosed(s) ? ('ended' as const) : ('live' as const) },
    people: await db.countPeople(s.id),
    items,
    questions: (await db.listQuestions(s.id)).map(publicQuestion),
  };
}
