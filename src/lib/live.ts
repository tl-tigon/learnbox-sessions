/**
 * Running a session: starting it, the presenter's controls, answers, and what each screen sees.
 * Routes call these; the store keeps the data; push carries changes to screens as they happen.
 */
import { checkAnswer } from './engine/answers';
import { isInteractive } from './engine/slides';
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

export async function startSession(db: Store, ownerSub: string, p: Presentation, mode: SessionMode): Promise<Session> {
  if (!p.slides.length) throw new LiveError(400, 'Add a slide first');
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
  | { action: 'lock'; on: boolean };

export function applyControl(s: Session, a: ControlAction): SessionState {
  const st = s.state;
  const last = s.slides.length - 1;
  const move = (i: number): SessionState => ({ ...st, current: Math.max(0, Math.min(last, i)), locked: false, seq: st.seq + 1 });
  switch (a.action) {
    case 'go': return move(Math.trunc(Number(a.index)) || 0);
    case 'next': return move(st.current + 1);
    case 'prev': return move(st.current - 1);
    case 'results': return { ...st, showResults: !!a.on, seq: st.seq + 1 };
    case 'lock': return { ...st, locked: !!a.on, seq: st.seq + 1 };
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
  return {
    kind: 'state',
    seq: s.state.seq,
    status: isClosed(s) ? 'ended' : 'live',
    state: s.state,
    slide: s.mode === 'presenter' ? s.slides[s.state.current] ?? null : null,
    index: s.state.current,
    total: s.slides.length,
  };
}

export async function respond(db: Store, s: Session, token: string, slideId: string, raw: unknown): Promise<{ tally: Tally; entries: number; done: boolean }> {
  if (isClosed(s)) throw new LiveError(409, 'This session has ended');
  const slide = s.slides.find((x) => x.id === slideId);
  if (!slide || !isInteractive(slide)) throw new LiveError(400, 'This slide takes no answer');
  if (s.mode === 'presenter') {
    if (s.slides[s.state.current]?.id !== slideId) throw new LiveError(409, 'The presenter has moved on');
    if (s.state.locked) throw new LiveError(409, 'Answers are closed');
  }
  if (!(await db.getPerson(s.id, token))) throw new LiveError(403, 'Join the session first');

  const c = checkAnswer(slide, raw);
  if (!c.ok) throw new LiveError(400, c.error);

  /* Take the first free entry. Entry 0 is the person's first answer to this slide, which is
     what counts them as one more person who answered. */
  const at = new Date().toISOString();
  let entry = -1;
  for (let n = 0; n < c.maxEntries; n++) {
    if (await db.addAnswer(s.id, { slideId, token, entry: n, answer: c.answer, at })) {
      entry = n;
      break;
    }
  }
  if (entry < 0) throw new LiveError(409, c.maxEntries > 1 ? 'You have sent the most allowed' : 'You have already answered');

  const tally = await db.bumpTally(s.id, slideId, c.delta, entry === 0);
  const text = c.answer.type === 'open' ? c.answer.text : undefined;
  await publish(tallyChannel(s.id, slideId), { kind: 'tally', slideId, tally, text, at });
  return { tally, entries: entry + 1, done: entry + 1 >= c.maxEntries };
}

/** What a phone sees. Slides are sent without anything the audience should not see. */
export async function audienceView(db: Store, s: Session, token: string | null) {
  const closed = isClosed(s);
  const base = { id: s.id, code: s.code, title: s.title, mode: s.mode, status: closed ? 'ended' : 'live', state: s.state };
  const person = token ? await db.getPerson(s.id, token) : null;
  if (s.mode === 'survey') return { ...base, joined: !!person, slides: s.slides };
  const slide = s.slides[s.state.current] ?? null;
  const mine = person && slide && isInteractive(slide) ? await db.myAnswers(s.id, slide.id, token!) : [];
  const tally = slide && isInteractive(slide) && s.state.showResults ? await db.getTally(s.id, slide.id) : null;
  return { ...base, joined: !!person, slide, index: s.state.current, total: s.slides.length, mine: mine.map((m) => m.answer), tally };
}

/** What the big screen and the control view see. */
export async function screenView(db: Store, s: Session) {
  const slide = s.slides[s.state.current] ?? null;
  const [people, tally, recent] = await Promise.all([
    db.countPeople(s.id),
    slide && isInteractive(slide) ? db.getTally(s.id, slide.id) : Promise.resolve(null),
    slide?.type === 'open' ? db.slideAnswers(s.id, slide.id, 500) : Promise.resolve([]),
  ]);
  return {
    id: s.id,
    code: s.code,
    title: s.title,
    mode: s.mode,
    status: isClosed(s) ? 'ended' : 'live',
    state: s.state,
    slides: s.slides as Slide[],
    slide,
    people,
    tally,
    texts: recent.map((r) => ({ text: r.answer.type === 'open' ? r.answer.text : '', at: r.at })),
  };
}

/** Full results of a session, slide by slide, for the results page and export. */
export async function sessionResults(db: Store, s: Session) {
  const slides = s.slides.filter(isInteractive);
  const rows = await Promise.all(
    slides.map(async (slide) => {
      const [tally, answers] = await Promise.all([db.getTally(s.id, slide.id), db.slideAnswers(s.id, slide.id, 100_000)]);
      return { slide, tally, answers };
    }),
  );
  return { session: { id: s.id, code: s.code, title: s.title, mode: s.mode, createdAt: s.createdAt, status: isClosed(s) ? 'ended' : 'live' }, people: await db.countPeople(s.id), rows };
}
