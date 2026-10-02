'use client';
/**
 * The audience's phone. Joins with the code, then follows the presenter (or, in a survey, goes
 * through the slides at its own pace). A session with a quiz asks for a name first.
 */
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { AnswerForm } from '@/components/answer-form';
import { QaPhone } from '@/components/qa';
import { LeaderboardPhone, QuizPhone, useServerClock, type Me } from '@/components/quiz';
import { Results } from '@/components/results';
import { browserToken, recordSent, savedName, saveName, sentCounts } from '@/lib/audience';
import type { BoardEntry } from '@/lib/engine/quiz';
import { isInteractive, isPoll } from '@/lib/engine/slides';
import { LIMITS } from '@/lib/limits';
import { useLive } from '@/lib/use-live';
import { stateChannel, tallyChannel, type PushEvent } from '@/lib/push/events';
import type { Answer, Session, SessionState, Slide, Tally } from '@/lib/types';

interface View {
  id: string;
  code: string;
  title: string;
  mode: Session['mode'];
  status: 'live' | 'ended';
  state: SessionState;
  serverNow: number;
  joined: boolean;
  nickname?: string;
  slide?: Slide | null;
  slides?: Slide[];
  index?: number;
  total?: number;
  mine?: Answer[];
  tally?: Tally | null;
  people?: number;
  me?: Me;
  top?: BoardEntry[];
}

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export default function AudiencePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [id, setId] = useState<string | null>(null);
  /* Set when the session wants a name before this phone can join. */
  const [naming, setNaming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  /** Joins; returns what went wrong, or null. */
  const join = useCallback(async (sessionId: string, nickname: string): Promise<string | null> => {
    const r = await post(`/api/live/${sessionId}`, { token: browserToken(), nickname });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return j.error ?? 'Could not join';
    setId(sessionId);
    return null;
  }, []);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/join/${code}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setProblem(j.error ?? 'No session with that code');
      if (j.needsName) {
        /* A phone that already joined with a name goes straight back in. */
        const v = await fetch(`/api/live/${j.id}?t=${browserToken()}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
        if (v?.joined && v.nickname) return setId(j.id);
        return setNaming(j.id);
      }
      const e = await join(j.id, '');
      if (e) setProblem(e);
    })().catch(() => setProblem('Connection lost'));
  }, [code, join]);

  if (problem) {
    return (
      <main className="narrow stack">
        <p>{problem}</p>
        <a className="btn" href="/">Enter another code</a>
      </main>
    );
  }
  if (id) return <Joined id={id} />;
  if (naming) return <NameForm onJoin={(name) => join(naming, name)} />;
  return <main className="narrow"><p className="muted">Joining…</p></main>;
}

function NameForm({ onJoin }: { onJoin: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setName(savedName()), []);
  return (
    <main className="narrow">
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const problem = await onJoin(name.trim());
        setBusy(false);
        if (problem) setErr(problem);
        else saveName(name);
      }}>
        <label>Name<input value={name} maxLength={LIMITS.nicknameChars} autoFocus onChange={(e) => setName(e.target.value)} /></label>
        <button type="submit" className="primary" disabled={busy || !name.trim()}>Join</button>
        {err && <p className="error small" role="alert">{err}</p>}
      </form>
    </main>
  );
}

function Joined({ id }: { id: string }) {
  const token = browserToken();
  const load = useCallback(async () => {
    const r = await fetch(`/api/live/${id}?t=${token}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('Connection lost');
    return (await r.json()) as View;
  }, [id, token]);

  const apply = useCallback((cur: View, e: PushEvent): View => {
    if (e.kind === 'state') {
      if (e.seq <= cur.state.seq) return cur;
      const moved = e.slide?.id !== cur.slide?.id;
      return {
        ...cur, status: e.status, state: e.state, slide: e.slide, index: e.index, total: e.total, serverNow: e.now,
        mine: moved ? [] : cur.mine,
        tally: moved || !e.state.showResults ? null : cur.tally,
        me: moved ? undefined : cur.me,
        top: moved ? undefined : cur.top,
      };
    }
    if (e.kind === 'tally' && cur.slide?.id === e.slideId && cur.state.showResults && cur.slide && isPoll(cur.slide)) return { ...cur, tally: e.tally };
    return cur;
  }, []);

  const [channels, setChannels] = useState<string[]>([stateChannel(id)]);
  const reload = useRef<() => void>(() => {});
  const { data: v, setData, error, refresh } = useLive<View>(load, channels, apply, {
    /* A reveal or a leaderboard shows this person's own points and place, which only a reload brings.
       The wait is random so a full room does not ask in the same instant. */
    onEvent: (e) => {
      if (e.kind === 'state' && (e.state.quiz?.revealed || e.slide?.type === 'leaderboard')) setTimeout(() => reload.current(), Math.random() * 1500);
    },
  });
  reload.current = () => void refresh();
  const now = useServerClock(v?.serverNow);

  const slideId = v?.slide?.id;
  const watchTally = !!v?.state.showResults && !!v?.slide && isPoll(v.slide);
  useEffect(() => {
    setChannels(slideId && watchTally ? [stateChannel(id), tallyChannel(id, slideId)] : [stateChannel(id)]);
  }, [id, slideId, watchTally]);

  const send = useCallback(async (slide: Slide, answer: unknown): Promise<string | null> => {
    const r = await post(`/api/live/${id}/answer`, { token, slideId: slide.id, answer });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 409 && /already|most allowed/.test(j.error ?? '')) recordSent(id, slide.id, 99);
      return j.error ?? 'Not sent';
    }
    recordSent(id, slide.id, j.entries);
    if (isPoll(slide)) setData((cur) => (cur ? { ...cur, tally: j.tally ?? cur.tally } : cur));
    void refresh();
    return null;
  }, [id, token, setData, refresh]);

  if (!v) return <main className="narrow"><p className="muted">{error ?? 'Joining…'}</p></main>;
  if (v.status === 'ended') return <main className="narrow stack"><h2>{v.title}</h2><p className="muted">Session ended</p></main>;
  if (v.mode === 'survey') return <Survey v={v} token={token} send={send} />;

  const slide = v.slide;
  const sent = slide ? Math.max(v.mine?.length ?? 0, sentCounts(id)[slide.id] ?? 0) : 0;
  return (
    <main className="narrow stack">
      <div className="spread muted small"><span>{v.title}</span><span className="num">{(v.index ?? 0) + 1} / {v.total}</span></div>
      {slide && (
        <section className="card stack" aria-live="polite">
          <h2>{slide.title}</h2>
          {slide.type === 'content' && slide.body && <p style={{ whiteSpace: 'pre-wrap' }}>{slide.body}</p>}
          {slide.type === 'qa' && <QaPhone key={slide.id} sessionId={id} slide={slide} token={token} state={v.state} closed={v.state.locked} />}
          {slide.type === 'quiz' && (
            <QuizPhone key={slide.id} slide={slide} state={v.state} now={now} mine={v.mine ?? []} me={v.me} people={v.people} nickname={v.nickname ?? ''} onSend={(a) => send(slide, a)} />
          )}
          {slide.type === 'leaderboard' && <LeaderboardPhone me={v.me} top={v.top} />}
          {isPoll(slide) && (v.state.locked ? <p className="muted">Answers closed</p> : (
            <AnswerForm key={slide.id} slide={slide} sent={sent} onSend={(a) => send(slide, a)} />
          ))}
          {isPoll(slide) && v.state.showResults && v.tally && sent > 0 && <Results slide={slide} tally={v.tally} />}
        </section>
      )}
    </main>
  );
}

function Survey({ v, token, send }: { v: View; token: string; send: (s: Slide, a: unknown) => Promise<string | null> }) {
  const slides = v.slides ?? [];
  const [i, setI] = useState(0);
  const [, force] = useState(0);
  const slide = slides[i];
  if (!slide) return null;
  const sent = sentCounts(v.id)[slide.id] ?? 0;
  const last = i === slides.length - 1;
  return (
    <main className="narrow stack">
      <div className="spread muted small"><span>{v.title}</span><span className="num">{i + 1} / {slides.length}</span></div>
      <section className="card stack">
        <h2>{slide.title}</h2>
        {slide.type === 'content' && slide.body && <p style={{ whiteSpace: 'pre-wrap' }}>{slide.body}</p>}
        {slide.type === 'qa' && <QaPhone key={slide.id} sessionId={v.id} slide={slide} token={token} state={v.state} closed={false} />}
        {isInteractive(slide) && (
          <AnswerForm key={slide.id} slide={slide} sent={sent} onSend={async (a) => {
            const e = await send(slide, a);
            force((n) => n + 1);
            return e;
          }} />
        )}
      </section>
      <div className="spread">
        <button disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
        {last ? <span className="muted">End of survey</span> : <button className="primary" onClick={() => setI(i + 1)}>Next</button>}
      </div>
    </main>
  );
}
