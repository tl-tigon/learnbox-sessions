'use client';
/** The presenter's controls, on a laptop or phone: move slides, show results, close answers, end. */
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authed } from '@/lib/auth/client';
import { QaModeration } from '@/components/qa';
import { Results } from '@/components/results';
import { useSignedIn } from '@/components/use-signed-in';
import { isInteractive } from '@/lib/engine/slides';
import { useScreen, withQuestion } from '@/lib/use-screen';

export default function Control({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const email = useSignedIn();
  if (!email) return null;
  return <Panel id={id} />;
}

function Panel({ id }: { id: string }) {
  const router = useRouter();
  const { data: v, setData, error, refresh } = useScreen(id, null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    const r = await authed(`/api/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? 'Not applied');
    setData((cur) => {
      if (!cur || j.state.seq <= cur.state.seq) return cur;
      const same = j.state.current === cur.state.current;
      return { ...cur, state: j.state, slide: cur.slides[j.state.current] ?? null, tally: same ? cur.tally : null, texts: same ? cur.texts : [], questions: same ? cur.questions : [] };
    });
    void refresh();
  };

  /* Arrow keys and space move slides, as a clicker would. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); void act({ action: 'next' }); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); void act({ action: 'prev' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!v) return <main className="wrap"><p className={error ? 'error' : 'muted'}>{error ?? 'Loading…'}</p></main>;
  const screenUrl = `${origin}/present/${id}`;
  const projectorUrl = v.displayKey ? `${screenUrl}#k=${v.displayKey}` : screenUrl;
  const slide = v.slide;

  if (v.status === 'ended') {
    return (
      <main className="wrap stack">
        <h2>{v.title}</h2>
        <p className="muted">Session ended</p>
        <a className="btn primary" href={`/app/sessions/${id}`}>Results</a>
      </main>
    );
  }

  return (
    <main className="wrap stack">
      <div className="spread">
        <a href="/app">← Presentations</a>
        <div className="row">
          <a className="btn" href={screenUrl} target="_blank" rel="noreferrer">Open screen</a>
          <button onClick={() => navigator.clipboard?.writeText(projectorUrl)}>Copy projector link</button>
          <button className="danger" disabled={busy} onClick={async () => {
            if (!confirm('End this session? People can no longer answer.')) return;
            const r = await authed(`/api/sessions/${id}`, { method: 'DELETE' });
            if (r.ok) router.push(`/app/sessions/${id}`);
          }}>End session</button>
        </div>
      </div>

      <div className="card spread">
        <span>{v.title}</span>
        <span className="num">Code {v.code} · {v.people} joined</span>
      </div>
      {err && <p className="error" role="alert">{err}</p>}

      {v.mode === 'survey' ? (
        <p className="muted">Survey: people go through the slides at their own pace. <a href={`/app/sessions/${id}`}>Results</a></p>
      ) : (
        <>
          <div className="row">
            <button disabled={busy || v.state.current === 0} onClick={() => act({ action: 'prev' })}>Previous</button>
            <button className="primary" disabled={busy || v.state.current >= v.slides.length - 1} onClick={() => act({ action: 'next' })}>Next</button>
            <span className="num muted">{v.state.current + 1} / {v.slides.length}</span>
            <button className={v.state.showResults ? 'on' : ''} aria-pressed={v.state.showResults} disabled={busy} onClick={() => act({ action: 'results', on: !v.state.showResults })}>Results {v.state.showResults ? 'shown' : 'hidden'}</button>
            {slide && isInteractive(slide) && (
              <button className={v.state.locked ? 'on' : ''} aria-pressed={v.state.locked} disabled={busy} onClick={() => act({ action: 'lock', on: !v.state.locked })}>{v.state.locked ? 'Answers closed' : 'Close answers'}</button>
            )}
            {slide?.type === 'qa' && (
              <button className={v.state.locked ? 'on' : ''} aria-pressed={v.state.locked} disabled={busy} onClick={() => act({ action: 'lock', on: !v.state.locked })}>{v.state.locked ? 'Questions closed' : 'Close questions'}</button>
            )}
          </div>

          {slide && (
            <section className="card stack">
              <div className="spread">
                <h2>{slide.title || '—'}</h2>
                {isInteractive(slide) && <span className="num muted">{v.tally?.people ?? 0} answered</span>}
                {slide.type === 'qa' && <span className="num muted">{v.questions.filter((q) => q.status !== 'hidden').length} questions</span>}
              </div>
              {isInteractive(slide) && <Results slide={slide} tally={v.tally} texts={v.texts} />}
              {slide.type === 'qa' && (
                <QaModeration sessionId={id} slide={slide} questions={v.questions} state={v.state}
                  onChange={(q, state) => setData((cur) => (cur ? { ...cur, questions: withQuestion(cur.questions, q), state: state.seq > cur.state.seq ? state : cur.state } : cur))} />
              )}
            </section>
          )}

          <section className="list" aria-label="Slides">
            {v.slides.map((s, i) => (
              <button key={s.id} className={`thumb ${i === v.state.current ? 'on' : ''}`} disabled={busy} onClick={() => act({ action: 'go', index: i })}>
                <span className="muted small num">{i + 1}</span>
                <span>{s.title || '—'}</span>
              </button>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
