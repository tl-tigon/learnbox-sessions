'use client';
import { useState } from 'react';
import type { Slide } from '@/lib/types';

/**
 * The phone's answer form for one slide. `sent` is how many entries this person has already sent;
 * the form disappears once they have sent the most the slide allows.
 */
export function AnswerForm({ slide, sent, disabled, onSend }: {
  slide: Slide;
  sent: number;
  disabled?: boolean;
  onSend: (answer: unknown) => Promise<string | null>;
}) {
  const [picks, setPicks] = useState<string[]>([]);
  const [value, setValue] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const max = slide.type === 'wordcloud' || slide.type === 'open' ? slide.maxEntries : 1;
  if (slide.type === 'content' || slide.type === 'qa') return null;
  if (sent >= max) return <p className="muted">Sent</p>;

  const send = async (answer: unknown) => {
    setBusy(true);
    setErr(null);
    const e = await onSend(answer);
    setBusy(false);
    if (e) setErr(e);
    else {
      setText('');
      setPicks([]);
      setValue(null);
    }
  };

  const off = disabled || busy;
  return (
    <form className="stack" onSubmit={(e) => e.preventDefault()}>
      {slide.type === 'choice' && (
        <>
          {slide.maxPicks > 1 && <p className="muted small">Pick up to {slide.maxPicks}</p>}
          {slide.options.map((o) => {
            const on = picks.includes(o.id);
            return (
              <button type="button" key={o.id} className={on ? 'on' : ''} disabled={off} aria-pressed={on}
                onClick={() => setPicks(slide.maxPicks === 1 ? [o.id] : on ? picks.filter((x) => x !== o.id) : picks.length < slide.maxPicks ? [...picks, o.id] : picks)}>
                {o.label}
              </button>
            );
          })}
          <button type="submit" className="primary" disabled={off || !picks.length} onClick={() => send({ optionIds: picks })}>Submit</button>
        </>
      )}
      {slide.type === 'rating' && (
        <>
          <div className="row">
            {Array.from({ length: slide.max }, (_, i) => i + 1).map((v) => (
              <button type="button" key={v} className={value === v ? 'on num' : 'num'} disabled={off} aria-pressed={value === v} onClick={() => setValue(v)}>{v}</button>
            ))}
          </div>
          {(slide.lowLabel || slide.highLabel) && <div className="spread muted small"><span>1 · {slide.lowLabel}</span><span>{slide.max} · {slide.highLabel}</span></div>}
          <button type="submit" className="primary" disabled={off || value == null} onClick={() => send({ value })}>Submit</button>
        </>
      )}
      {(slide.type === 'wordcloud' || slide.type === 'open') && (
        <>
          {slide.type === 'open'
            ? <textarea rows={3} value={text} maxLength={280} disabled={off} onChange={(e) => setText(e.target.value)} aria-label="Your answer" />
            : <input value={text} maxLength={25} disabled={off} onChange={(e) => setText(e.target.value)} aria-label="Your word" />}
          {max > 1 && <p className="muted small num">{sent} / {max}</p>}
          <button type="submit" className="primary" disabled={off || !text.trim()} onClick={() => send({ text })}>Submit</button>
        </>
      )}
      {err && <p className="error small" role="alert">{err}</p>}
    </form>
  );
}
