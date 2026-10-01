'use client';
import type { Slide, Tally } from '@/lib/types';

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** Live results for one slide: bars for choice and rating, a cloud for words, cards for text. */
export function Results({ slide, tally, texts = [] }: { slide: Slide; tally: Tally | null; texts?: { text: string }[] }) {
  const t = tally ?? { people: 0, counts: {} };
  if (slide.type === 'choice') {
    const max = Math.max(1, ...slide.options.map((o) => t.counts[o.id] ?? 0));
    return (
      <div className="bars">
        {slide.options.map((o) => {
          const n = t.counts[o.id] ?? 0;
          return (
            <div className="bar" key={o.id}>
              <div className="spread"><span>{o.label}</span><span className="num">{n} · {pct(n, t.people)}%</span></div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / max) * 100}%` }} /></div>
            </div>
          );
        })}
      </div>
    );
  }
  if (slide.type === 'rating') {
    const values = Array.from({ length: slide.max }, (_, i) => i + 1);
    const max = Math.max(1, ...values.map((v) => t.counts[String(v)] ?? 0));
    const sum = values.reduce((a, v) => a + v * (t.counts[String(v)] ?? 0), 0);
    return (
      <div className="stack">
        <div className="num" style={{ fontSize: '2em' }}>{t.people ? (sum / t.people).toFixed(1) : '–'} <span className="muted small">/ {slide.max}</span></div>
        <div className="bars">
          {values.map((v) => {
            const n = t.counts[String(v)] ?? 0;
            return (
              <div className="bar" key={v}>
                <div className="spread"><span className="num">{v}{v === 1 && slide.lowLabel ? ` · ${slide.lowLabel}` : ''}{v === slide.max && slide.highLabel ? ` · ${slide.highLabel}` : ''}</span><span className="num">{n}</span></div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / max) * 100}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (slide.type === 'wordcloud') {
    const words = Object.entries(t.counts).sort((a, b) => b[1] - a[1]).slice(0, 80);
    const top = words[0]?.[1] ?? 1;
    return (
      <div className="cloud">
        {words.map(([w, n]) => (
          <span key={w} style={{ fontSize: `${1 + (n / top) * 2.6}em`, fontWeight: n === top ? 700 : 500, opacity: 0.55 + (n / top) * 0.45 }}>{w}</span>
        ))}
      </div>
    );
  }
  if (slide.type === 'open') {
    return (
      <div className="texts">
        {[...texts].reverse().slice(0, 60).map((x, i) => <div key={i}>{x.text}</div>)}
      </div>
    );
  }
  return null;
}
