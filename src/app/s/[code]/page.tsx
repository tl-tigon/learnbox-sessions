'use client';
/**
 * The audience's phone. Joins with the code, then follows the presenter (or, in a survey, goes
 * through the slides at its own pace).
 */
import { use, useCallback, useEffect, useState } from 'react';
import { AnswerForm } from '@/components/answer-form';
import { QaPhone } from '@/components/qa';
import { Results } from '@/components/results';
import { browserToken, recordSent, sentCounts } from '@/lib/audience';
import { isInteractive } from '@/lib/engine/slides';
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
  joined: boolean;
  slide?: Slide | null;
  slides?: Slide[];
  index?: number;
  total?: number;
  mine?: Answer[];
  tally?: Tally | null;
}

export default function AudiencePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [id, setId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/join/${code}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setProblem(j.error ?? 'No session with that code');
      const token = browserToken();
      const jr = await fetch(`/api/live/${j.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
      const jj = await jr.json().catch(() => ({}));
      if (!jr.ok) return setProblem(jj.error ?? 'Could not join');
      setId(j.id);
    })().catch(() => setProblem('Connection lost'));
  }, [code]);

  if (problem) {
    return (
      <main className="narrow stack">
        <p>{problem}</p>
        <a className="btn" href="/">Enter another code</a>
      </main>
    );
  }
  if (!id) return <main className="narrow"><p className="muted">Joining…</p></main>;
  return <Joined id={id} />;
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
      return { ...cur, status: e.status, state: e.state, slide: e.slide, index: e.index, total: e.total, mine: moved ? [] : cur.mine, tally: moved || !e.state.showResults ? null : cur.tally };
    }
    if (e.kind === 'tally' && cur.slide?.id === e.slideId && cur.state.showResults) return { ...cur, tally: e.tally };
    return cur;
  }, []);

  const [channels, setChannels] = useState<string[]>([stateChannel(id)]);
  const { data: v, setData, error, refresh } = useLive<View>(load, channels, apply);

  const slideId = v?.slide?.id;
  const showResults = !!v?.state.showResults;
  useEffect(() => {
    setChannels(slideId && showResults ? [stateChannel(id), tallyChannel(id, slideId)] : [stateChannel(id)]);
  }, [id, slideId, showResults]);

  const send = useCallback(async (slide: Slide, answer: unknown): Promise<string | null> => {
    const r = await fetch(`/api/live/${id}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, slideId: slide.id, answer }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 409 && /already|most allowed/.test(j.error ?? '')) recordSent(id, slide.id, 99);
      return j.error ?? 'Not sent';
    }
    recordSent(id, slide.id, j.entries);
    setData((cur) => (cur ? { ...cur, tally: j.tally ?? cur.tally } : cur));
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
          {slide.type === 'qa' ? (
            <QaPhone key={slide.id} sessionId={id} slide={slide} token={token} state={v.state} closed={v.state.locked} />
          ) : v.state.locked && isInteractive(slide) ? <p className="muted">Answers closed</p> : (
            <AnswerForm key={slide.id} slide={slide} sent={sent} onSend={(a) => send(slide, a)} />
          )}
          {isInteractive(slide) && v.state.showResults && v.tally && sent > 0 && <Results slide={slide} tally={v.tally} />}
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
        {slide.type === 'qa' ? (
          <QaPhone key={slide.id} sessionId={v.id} slide={slide} token={token} state={v.state} closed={false} />
        ) : (
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
