'use client';
/** The big screen: the join code and QR, the current slide, and its results as they come in. */
import { use, useEffect, useState } from 'react';
import { Qr } from '@/components/qr';
import { Results } from '@/components/results';
import { useScreen } from '@/lib/use-screen';

export default function Present({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  /* A projector PC that is not signed in opens the link with #k=<display key>. */
  const [key, setKey] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setKey(new URLSearchParams(window.location.hash.slice(1)).get('k'));
  }, []);
  if (key === undefined) return null;
  return <Screen id={id} displayKey={key} />;
}

function Screen({ id, displayKey }: { id: string; displayKey: string | null }) {
  const { data: v, error } = useScreen(id, displayKey);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  if (!v) return <main className="screen"><p className="muted">{error ?? 'Loading…'}</p></main>;
  const host = origin.replace(/^https?:\/\//, '');
  const joinUrl = `${origin}/s/${v.code}`;
  const slide = v.mode === 'presenter' ? v.slide : null;

  if (v.status === 'ended') {
    return <main className="screen"><div /><h1>{v.title}</h1><p className="muted">Session ended</p></main>;
  }

  return (
    <main className="screen">
      <header className="joinbar">
        <span>Join at <strong>{host}</strong></span>
        <span>code <span className="num">{v.code.slice(0, 3)} {v.code.slice(3)}</span></span>
        <span className="muted num" style={{ marginLeft: 'auto' }}>{v.people} joined</span>
      </header>

      {slide ? (
        <section className="stack" style={{ alignContent: 'start' }}>
          <h1>{slide.title}</h1>
          {slide.type === 'content' && slide.body && <p style={{ fontSize: 28, whiteSpace: 'pre-wrap' }}>{slide.body}</p>}
          {slide.type !== 'content' && (v.state.showResults ? <Results slide={slide} tally={v.tally} texts={v.texts} /> : null)}
        </section>
      ) : (
        <section className="row" style={{ gap: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Qr url={joinUrl} size={320} />
          <div className="stack">
            <h1>{v.title}</h1>
            <div className="num" style={{ fontSize: 64, fontWeight: 700, letterSpacing: '0.1em' }}>{v.code.slice(0, 3)} {v.code.slice(3)}</div>
          </div>
        </section>
      )}

      <footer className="spread muted">
        {slide && slide.type !== 'content' ? <span className="num">{v.tally?.people ?? 0} answered{v.state.locked ? ' · closed' : ''}</span> : <span />}
        {slide ? <Qr url={joinUrl} size={120} /> : <span />}
      </footer>
    </main>
  );
}
