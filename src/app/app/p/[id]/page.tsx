'use client';
/** The presentation editor: slides on the left, the chosen slide's settings on the right. Saves as you type. */
import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authed } from '@/lib/auth/client';
import { useSignedIn } from '@/components/use-signed-in';
import { blankSlide, QUIZ_SECONDS, SLIDE_TYPES } from '@/lib/engine/slides';
import { LIMITS } from '@/lib/limits';
import type { Presentation, Slide, SlideType } from '@/lib/types';

const TYPE_LABEL: Record<SlideType, string> = {
  choice: 'Multiple choice',
  wordcloud: 'Word cloud',
  rating: 'Rating',
  open: 'Open text',
  qa: 'Q&A',
  quiz: 'Quiz question',
  leaderboard: 'Leaderboard',
  content: 'Heading',
};

export default function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const email = useSignedIn();
  const router = useRouter();
  const [p, setP] = useState<Presentation | null>(null);
  const [sel, setSel] = useState(0);
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error'>('saved');
  const [err, setErr] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (!email) return;
    authed(`/api/presentations/${id}`).then(async (r) => {
      if (!r.ok) return setErr('Not found');
      setP((await r.json()).presentation);
    });
  }, [email, id]);

  /* Save 700ms after the last change. */
  useEffect(() => {
    if (!p || !dirty.current) return;
    setSaved('saving');
    const t = setTimeout(async () => {
      const r = await authed(`/api/presentations/${id}`, { method: 'PUT', body: JSON.stringify({ title: p.title, slides: p.slides }) });
      dirty.current = false;
      setSaved(r.ok ? 'saved' : 'error');
    }, 700);
    return () => clearTimeout(t);
  }, [p, id]);

  const edit = (fn: (draft: Presentation) => void) => {
    setP((cur) => {
      if (!cur) return cur;
      const next = structuredClone(cur);
      fn(next);
      dirty.current = true;
      return next;
    });
  };
  const editSlide = (fn: (s: Slide) => void) => edit((d) => fn(d.slides[sel]));

  const start = async (mode: 'presenter' | 'survey') => {
    setErr(null);
    const r = await authed(`/api/presentations/${id}/sessions`, { method: 'POST', body: JSON.stringify({ mode }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    router.push(`/control/${j.session.id}`);
  };

  if (!email) return null;
  if (!p) return <main className="wrap"><p className={err ? 'error' : 'muted'}>{err ?? 'Loading…'}</p></main>;
  const slide = p.slides[sel];

  return (
    <main className="wrap stack">
      <div className="spread">
        <a href="/app">← Presentations</a>
        <div className="row">
          <span className="muted small">{saved === 'saving' ? 'Saving…' : saved === 'error' ? 'Not saved' : 'Saved'}</span>
          <button onClick={() => start('survey')} disabled={!p.slides.length || saved !== 'saved'}>Run as survey</button>
          <button className="primary" onClick={() => start('presenter')} disabled={!p.slides.length || saved !== 'saved'}>Present</button>
        </div>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <input aria-label="Presentation title" value={p.title} maxLength={LIMITS.titleChars} onChange={(e) => edit((d) => { d.title = e.target.value; })} style={{ fontSize: 22, fontWeight: 600 }} />

      <div className="editor">
        <aside className="stack">
          <div className="list">
            {p.slides.map((s, i) => (
              <button key={s.id} className={`thumb ${i === sel ? 'on' : ''}`} onClick={() => setSel(i)}>
                <span className="muted small num">{i + 1} · {TYPE_LABEL[s.type]}</span>
                <span>{s.title || '—'}</span>
              </button>
            ))}
          </div>
          {p.slides.length < LIMITS.slidesPerPresentation && (
            <label>Add slide
              <select value="" onChange={(e) => {
                const type = e.target.value as SlideType;
                if (!type) return;
                edit((d) => { d.slides.splice(sel + 1, 0, blankSlide(type)); });
                setSel(Math.min(sel + 1, p.slides.length));
              }}>
                <option value="">Choose a type</option>
                {SLIDE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </label>
          )}
        </aside>

        {slide ? (
          <section className="card stack" aria-label="Slide settings">
            <div className="spread">
              <strong>{TYPE_LABEL[slide.type]}</strong>
              <div className="row">
                <button aria-label="Move up" disabled={sel === 0} onClick={() => { edit((d) => { const [x] = d.slides.splice(sel, 1); d.slides.splice(sel - 1, 0, x); }); setSel(sel - 1); }}>↑</button>
                <button aria-label="Move down" disabled={sel === p.slides.length - 1} onClick={() => { edit((d) => { const [x] = d.slides.splice(sel, 1); d.slides.splice(sel + 1, 0, x); }); setSel(sel + 1); }}>↓</button>
                <button className="danger" onClick={() => { edit((d) => { d.slides.splice(sel, 1); }); setSel(Math.max(0, sel - 1)); }}>Delete slide</button>
              </div>
            </div>
            <label>{slide.type === 'content' ? 'Heading' : slide.type === 'qa' || slide.type === 'leaderboard' ? 'Title' : 'Question'}
              <input value={slide.title} maxLength={LIMITS.titleChars} onChange={(e) => editSlide((s) => { s.title = e.target.value; })} />
            </label>
            <SlideSettings slide={slide} edit={editSlide} />
          </section>
        ) : (
          <section className="card muted">No slides</section>
        )}
      </div>

      <div className="row">
        <button className="danger" onClick={async () => {
          if (!confirm(`Delete "${p.title}"? Results of past sessions are kept.`)) return;
          const r = await authed(`/api/presentations/${id}`, { method: 'DELETE' });
          if (r.ok) router.push('/app');
        }}>Delete presentation</button>
      </div>
    </main>
  );
}

function SlideSettings({ slide, edit }: { slide: Slide; edit: (fn: (s: Slide) => void) => void }) {
  const num = (v: string) => Number(v) || 1;
  switch (slide.type) {
    case 'choice':
      return (
        <div className="stack">
          {slide.options.map((o, i) => (
            <div className="row" key={o.id} style={{ flexWrap: 'nowrap' }}>
              <input aria-label={`Option ${i + 1}`} value={o.label} maxLength={LIMITS.optionChars} placeholder={`Option ${i + 1}`}
                onChange={(e) => edit((s) => { if (s.type === 'choice') s.options[i].label = e.target.value; })} />
              <button aria-label={`Remove option ${i + 1}`} disabled={slide.options.length <= 2}
                onClick={() => edit((s) => { if (s.type === 'choice') { s.options.splice(i, 1); s.maxPicks = Math.min(s.maxPicks, s.options.length); } })}>×</button>
            </div>
          ))}
          {slide.options.length < LIMITS.optionsPerChoice && (
            <button onClick={() => edit((s) => { if (s.type === 'choice') s.options.push({ id: Math.random().toString(36).slice(2, 10), label: '' }); })}>Add option</button>
          )}
          <label>Picks per person
            <input type="number" min={1} max={slide.options.length} value={slide.maxPicks} onChange={(e) => edit((s) => { if (s.type === 'choice') s.maxPicks = Math.min(s.options.length, Math.max(1, num(e.target.value))); })} />
          </label>
        </div>
      );
    case 'wordcloud':
    case 'open':
      return (
        <label>{slide.type === 'wordcloud' ? 'Words per person' : 'Answers per person'}
          <input type="number" min={1} max={LIMITS.entriesPerPerson} value={slide.maxEntries}
            onChange={(e) => edit((s) => { if (s.type === 'wordcloud' || s.type === 'open') s.maxEntries = Math.min(LIMITS.entriesPerPerson, Math.max(1, num(e.target.value))); })} />
        </label>
      );
    case 'rating':
      return (
        <div className="stack">
          <label>Scale
            <select value={slide.max} onChange={(e) => edit((s) => { if (s.type === 'rating') s.max = Number(e.target.value); })}>
              {[3, 4, 5, 7, 10].map((n) => <option key={n} value={n}>1 to {n}</option>)}
            </select>
          </label>
          <label>Label for 1<input value={slide.lowLabel} maxLength={LIMITS.optionChars} onChange={(e) => edit((s) => { if (s.type === 'rating') s.lowLabel = e.target.value; })} /></label>
          <label>Label for {slide.max}<input value={slide.highLabel} maxLength={LIMITS.optionChars} onChange={(e) => edit((s) => { if (s.type === 'rating') s.highLabel = e.target.value; })} /></label>
        </div>
      );
    case 'quiz':
      return (
        <div className="stack">
          <span className="muted small">Correct · Option</span>
          {slide.options.map((o, i) => (
            <div className="row" key={o.id} style={{ flexWrap: 'nowrap' }}>
              <label className="check" style={{ flex: 'none' }}>
                <input type="radio" name={`correct-${slide.id}`} checked={slide.correctId === o.id} aria-label={`Option ${i + 1} is correct`}
                  onChange={() => edit((s) => { if (s.type === 'quiz') s.correctId = o.id; })} />
              </label>
              <input aria-label={`Option ${i + 1}`} value={o.label} maxLength={LIMITS.optionChars} placeholder={`Option ${i + 1}`}
                onChange={(e) => edit((s) => { if (s.type === 'quiz') s.options[i].label = e.target.value; })} />
              <button aria-label={`Remove option ${i + 1}`} disabled={slide.options.length <= 2}
                onClick={() => edit((s) => { if (s.type === 'quiz') { s.options.splice(i, 1); if (!s.options.some((x) => x.id === s.correctId)) s.correctId = s.options[0].id; } })}>×</button>
            </div>
          ))}

          {slide.options.length < LIMITS.quizOptions && (
            <button onClick={() => edit((s) => { if (s.type === 'quiz') s.options.push({ id: Math.random().toString(36).slice(2, 10), label: '' }); })}>Add option</button>
          )}
          <label>Time limit
            <select value={slide.seconds} onChange={(e) => edit((s) => { if (s.type === 'quiz') s.seconds = Number(e.target.value); })}>
              {QUIZ_SECONDS.map((n) => <option key={n} value={n}>{n} seconds</option>)}
            </select>
          </label>
        </div>
      );
    case 'leaderboard':
      return null;
    case 'qa':
      return (
        <div className="stack">
          <label className="check"><input type="checkbox" checked={slide.moderation} onChange={(e) => edit((s) => { if (s.type === 'qa') s.moderation = e.target.checked; })} />Approve questions before they show</label>
          <label className="check"><input type="checkbox" checked={slide.anonymous} onChange={(e) => edit((s) => { if (s.type === 'qa') s.anonymous = e.target.checked; })} />Anonymous questions allowed</label>
        </div>
      );
    case 'content':
      return (
        <label>Text
          <textarea rows={4} value={slide.body} maxLength={LIMITS.contentChars} onChange={(e) => edit((s) => { if (s.type === 'content') s.body = e.target.value; })} />
        </label>
      );
  }
}
