/**
 * Running a session: starting it, the presenter's controls, answers, and what each screen sees.
 * Routes call these; the store keeps the data; push carries changes to screens as they happen.
 */
import { checkAnswer } from './engine/answers';
import { isShown, publicQuestion } from './engine/questions';
import { forAudience, hasQuiz, isFinalBoard, latestQuizSlide, openQuiz, playedQuiz, publicBoard, quizPhase, quizPoints, rankBoard, revealQuiz } from './engine/quiz';
import { isInteractive, isPoll } from './engine/slides';
import { newCode, newId, newSecret } from './ids';
import { LIMITS } from './limits';
import { publish } from './push/server';
import { stateChannel, tallyChannel, type PushEvent } from './push/events';
import type { Store } from './store/types';
import type { Presentation, Session, SessionMode, SessionState, Slide, Tally } from './types';

export class LiveError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** True once a live session has passed its close time. */
export const isClosed = (s: Session) => s.status !== 'live' || s.closesAt * 1000 < Date.now();

/** A session with a quiz question asks each person for a name, which the leaderboard shows. */
export const needsName = (s: Session) => hasQuiz(s.slides);

export async function startSession(db: Store, ownerSub: string, p: Presentation, mode: SessionMode): Promise<Session> {
  if (!p.slides.length) throw new LiveError(400, 'Add a slide first');
  if (mode === 'survey' && p.slides.some((x) => x.type === 'quiz' || x.type === 'leaderboard')) {
    throw new LiveError(400, 'Quiz slides need a presenter. Use Present.');
  }
  const live = (await db.listSessions(ownerSub)).filter((s) => s.status === 'live' && s.closesAt * 1000 > Date.now());
  if (live.length >= LIMITS.liveSessionsPerAccount) {
    throw new LiveError(409, `Up to ${LIMITS.liveSessionsPerAccount} live sessions at once. End one to start another.`);
  }
  const now = new Date();
  for (let attempt = 0; attempt < 8; attempt++) {
    const s: Session = {
      id: newId(),
      code: newCode(),
      ownerSub,
      presentationId: p.id,
      title: p.title,
      slides: structuredClone(p.slides),
      mode,
      status: 'live',
      state: { current: 0, showResults: true, locked: false, seq: 1 },
      displayKey: newSecret(),
      createdAt: now.toISOString(),
      closesAt: Math.floor(now.getTime() / 1000) + LIMITS.sessionHours * 3600,
    };
    if (await db.createSession(s)) return s;
  }
  throw new LiveError(503, 'Try again');
}

export type ControlAction =
  | { action: 'go'; index: number }
  | { action: 'next' }
  | { action: 'prev' }
  | { action: 'results'; on: boolean }
  | { action: 'lock'; on: boolean }
  | { action: 'highlight'; id: string | null }
  | { action: 'quiz-start' }
  | { action: 'quiz-reveal' };

/** The state after a control. `now` is the server's clock, which times quiz questions. */
export function applyControl(s: Session, a: ControlAction, now = Date.now()): SessionState {
  const st = s.state;
  const last = s.slides.length - 1;
  const move = (i: number): SessionState => {
    const current = Math.max(0, Math.min(last, i));
    const target = s.slides[current];
    const quiz = target?.type === 'quiz' && st.played?.includes(target.id) ? playedQuiz(target) : null;
    return { ...st, current, locked: false, highlight: null, quiz, seq: st.seq + 1 };
  };
  switch (a.action) {
    case 'go': return move(Math.trunc(Number(a.index)) || 0);
    case 'next': return move(st.current + 1);
    case 'prev': return move(st.current - 1);
    case 'results': return { ...st, showResults: !!a.on, seq: st.seq + 1 };
    case 'lock': return { ...st, locked: !!a.on, seq: st.seq + 1 };
    case 'highlight': return { ...st, highlight: a.id, seq: st.seq + 1 };
    case 'quiz-start': {
      const slide = s.slides[st.current];
      if (slide?.type !== 'quiz') throw new LiveError(400, 'This slide is not a quiz question');
      if (st.played?.includes(slide.id)) throw new LiveError(409, 'This question has been played');
      return { ...st, quiz: openQuiz(slide, now), played: [...(st.played ?? []), slide.id], seq: st.seq + 1 };
    }
    case 'quiz-reveal': {
      const slide = s.slides[st.current];
      if (slide?.type !== 'quiz' || st.quiz?.slideId !== slide.id) throw new LiveError(409, 'Start the question first');
      return { ...st, quiz: revealQuiz(slide, st.quiz, now), seq: st.seq + 1 };
    }
  }
}

/** Applies a control on top of the latest state, retrying if another control landed first. */
export async function control(db: Store, s: Session, a: ControlAction): Promise<Session> {
  let cur = s;
  for (let i = 0; i < 4; i++) {
    if (isClosed(cur)) throw new LiveError(409, 'This session has ended');
    const next = applyControl(cur, a);
    const saved = await db.setState(cur.id, next, cur.state.seq);
    if (saved) {
      await publish(stateChannel(saved.id), stateEvent(saved));
      /* Until now screens had only the number who answered; the reveal sends the spread. */
      if (a.action === 'quiz-reveal' && saved.state.quiz) {
        const slideId = saved.state.quiz.slideId;
        await publish(tallyChannel(saved.id, slideId), { kind: 'tally', slideId, tally: await db.getTally(saved.id, slideId) });
      }
      return saved;
    }
    const fresh = await db.getSession(cur.id);
    if (!fresh) throw new LiveError(404, 'Session not found');
    cur = fresh;
  }
  throw new LiveError(409, 'Try again');
}

export async function endSession(db: Store, s: Session): Promise<void> {
  await db.endSession(s);
  const ended = { ...s, status: 'ended' as const };
  await publish(stateChannel(s.id), stateEvent(ended));
}

export function stateEvent(s: Session): PushEvent {
  const slide = s.mode === 'presenter' ? s.slides[s.state.current] ?? null : null;
  return {
    kind: 'state',
    seq: s.state.seq,
    status: isClosed(s) ? 'ended' : 'live',
    state: s.state,
    slide: slide && forAudience(slide),
    index: s.state.current,
    total: s.slides.length,
    now: Date.now(),
  };
}

/** A quiz question's counts before the reveal: how many answered, and nothing about which option. */
const answeredOnly = (t: Tally): Tally => ({ people: t.people, counts: {} });

export async function respond(db: Store, s: Session, token: string, slideId: string, raw: unknown): Promise<{ tally: Tally; entries: number; done: boolean }> {
  if (isClosed(s)) throw new LiveError(409, 'This session has ended');
  const slide = s.slides.find((x) => x.id === slideId);
  if (!slide || !isInteractive(slide)) throw new LiveError(400, 'This slide takes no answer');
  if (s.mode === 'presenter') {
    if (s.slides[s.state.current]?.id !== slideId) throw new LiveError(409, 'The presenter has moved on');
    if (s.state.locked && slide.type !== 'quiz') throw new LiveError(409, 'Answers are closed');
  }
  const person = await db.getPerson(s.id, token);
  if (!person) throw new LiveError(403, 'Join the session first');

  /* A quiz answer is timed here, on arrival, against the moment the server opened the question. */
  const now = Date.now();
  if (slide.type === 'quiz') {
    const phase = quizPhase(s.state, slide.id, now);
    if (phase === 'ready') throw new LiveError(409, 'The question has not started');
    if (phase !== 'open') throw new LiveError(409, 'Time is up');
  }

  const c = checkAnswer(slide, raw);
  if (!c.ok) throw new LiveError(400, c.error);
  const points = slide.type === 'quiz' && c.answer.type === 'quiz'
    ? quizPoints(c.answer.optionId === slide.correctId, now - s.state.quiz!.openedAt, slide.seconds)
    : undefined;

  /* Take the first free entry. Entry 0 is the person's first answer to this slide, which is
     what counts them as one more person who answered. */
  const at = new Date(now).toISOString();
  let entry = -1;
  for (let n = 0; n < c.maxEntries; n++) {
    if (await db.addAnswer(s.id, { slideId, token, entry: n, answer: c.answer, at, ...(points === undefined ? {} : { points }) })) {
      entry = n;
      break;
    }
  }
  if (entry < 0) throw new LiveError(409, c.maxEntries > 1 ? 'You have sent the most allowed' : 'You have already answered');

  const full = await db.bumpTally(s.id, slideId, c.delta, entry === 0);
  if (points !== undefined) await db.addScore(s.id, token, person.nickname, slideId, points);
  const tally = slide.type === 'quiz' ? answeredOnly(full) : full;
  const text = c.answer.type === 'open' ? c.answer.text : undefined;
  await publish(tallyChannel(s.id, slideId), { kind: 'tally', slideId, tally, text, at });
  return { tally, entries: entry + 1, done: entry + 1 >= c.maxEntries };
}

/*
 * The leaderboard, worked out from every player's score. Scores only change while a question is
 * open, and nobody is shown the board then, so a short memo saves reading up to 1,000 rows for
 * each phone that asks at the same moment.
 */
const boards = new Map<string, { at: number; board: ReturnType<typeof rankBoard> }>();
async function boardOf(db: Store, s: Session) {
  const key = `${s.id}:${s.state.seq}`;
  const hit = boards.get(key);
  if (hit && Date.now() - hit.at < 3000) return hit.board;
  const board = rankBoard(await db.listScores(s.id), latestQuizSlide(s.slides, s.state.current));
  if (boards.size > 200) boards.clear();
  boards.set(key, { at: Date.now(), board });
  return board;
}

/** What a phone sees. Slides are sent without anything the audience should not see. */
export async function audienceView(db: Store, s: Session, token: string | null) {
  const closed = isClosed(s);
  const now = Date.now();
  const base = { id: s.id, code: s.code, title: s.title, mode: s.mode, status: closed ? 'ended' : 'live', state: s.state, serverNow: now };
  const person = token ? await db.getPerson(s.id, token) : null;
  if (s.mode === 'survey') return { ...base, joined: !!person, slides: s.slides };
  const slide = s.slides[s.state.current] ?? null;
  const mine = person && slide && isInteractive(slide) ? await db.myAnswers(s.id, slide.id, token!) : [];
  const tally = slide && isPoll(slide) && s.state.showResults ? await db.getTally(s.id, slide.id) : null;

  /* Quiz: the players in the lobby, then this person's place once a question is revealed or a leaderboard is up. */
  const inQuiz = slide?.type === 'quiz' || slide?.type === 'leaderboard';
  const scored = slide?.type === 'leaderboard' || (slide?.type === 'quiz' && quizPhase(s.state, slide.id, now) === 'revealed');
  const board = scored ? await boardOf(db, s) : null;
  const mineOnBoard = board?.find((e) => e.token === token);
  return {
    ...base,
    joined: !!person,
    nickname: person?.nickname ?? '',
    slide: slide && forAudience(slide),
    index: s.state.current,
    total: s.slides.length,
    mine: mine.map((m) => m.answer),
    tally,
    people: inQuiz ? await db.countPeople(s.id) : undefined,
    me: board ? { rank: mineOnBoard?.rank ?? null, total: mineOnBoard?.total ?? 0, last: mineOnBoard?.last ?? 0, players: board.length } : undefined,
    top: board && slide?.type === 'leaderboard' && isFinalBoard(s.slides, s.state.current) ? publicBoard(board, 3) : undefined,
  };
}

/**
 * What the big screen and the control view see. `moderator` adds the questions that wait for
 * approval or are hidden; a screen opened with the display key gets only what the audience sees.
 */
export async function screenView(db: Store, s: Session, moderator = false) {
  const slide = s.slides[s.state.current] ?? null;
  const now = Date.now();
  const [people, tally, recent, questions, board] = await Promise.all([
    db.countPeople(s.id),
    slide && isInteractive(slide) ? db.getTally(s.id, slide.id) : Promise.resolve(null),
    slide?.type === 'open' ? db.slideAnswers(s.id, slide.id, 500) : Promise.resolve([]),
    slide?.type === 'qa' ? db.listQuestions(s.id, slide.id) : Promise.resolve([]),
    slide?.type === 'leaderboard' ? boardOf(db, s) : Promise.resolve(null),
  ]);
  const hideSpread = slide?.type === 'quiz' && quizPhase(s.state, slide.id, now) !== 'revealed';
  return {
    id: s.id,
    code: s.code,
    title: s.title,
    mode: s.mode,
    status: isClosed(s) ? 'ended' : 'live',
    state: s.state,
    serverNow: now,
    slides: s.slides as Slide[],
    slide,
    people,
    tally: tally && hideSpread ? answeredOnly(tally) : tally,
    texts: recent.map((r) => ({ text: r.answer.type === 'open' ? r.answer.text : '', at: r.at })),
    questions: questions.filter((q) => moderator || isShown(q.status)).map(publicQuestion),
    board: board && { entries: publicBoard(board, LIMITS.boardSize), players: board.length, final: isFinalBoard(s.slides, s.state.current) },
  };
}

/** Full results of a session, slide by slide, for the results page and export. People's tokens stay here. */
export async function sessionResults(db: Store, s: Session) {
  const slides = s.slides.filter((x) => x.type !== 'content' && x.type !== 'leaderboard');
  const rows = await Promise.all(
    slides.map(async (slide) => {
      if (slide.type === 'qa') {
        const questions = (await db.listQuestions(s.id, slide.id)).map(publicQuestion);
        return { slide, tally: { people: 0, counts: {} } as Tally, answers: [], questions };
      }
      const [tally, answers] = await Promise.all([db.getTally(s.id, slide.id), db.slideAnswers(s.id, slide.id, 100_000)]);
      return { slide, tally, answers: answers.map((a) => ({ answer: a.answer, at: a.at, points: a.points })), questions: [] };
    }),
  );
  const board = hasQuiz(s.slides) ? publicBoard(rankBoard(await db.listScores(s.id), null), LIMITS.peoplePerSession) : [];
  return {
    session: { id: s.id, code: s.code, title: s.title, mode: s.mode, createdAt: s.createdAt, status: isClosed(s) ? 'ended' : 'live' },
    people: await db.countPeople(s.id),
    rows,
    board,
  };
}
