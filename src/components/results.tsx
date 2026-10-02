'use client';
/** Results of one poll or quiz question, as they build: bars, an average, a word cloud or a wall of answers. */
import { Icon } from './icons';
import type { Poll, QuizQuestion, Tally } from '@/lib/types';

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const LETTERS = ['A', 'B', 'C', 'D'];

/** One labelled bar with its figure at the end of it. The longest bar fills the row; the others are in proportion to it. */
function Bar({ label, value, share, lead, mark }: { label: React.ReactNode; value: string; share: number; lead?: boolean; mark?: 'correct' }) {
  return (
    <div className={`bar ${lead ? 'lead' : ''} ${mark ?? ''}`}>
      <span>{label}</span>
      <div className="line">
        <div className="bar-fill" style={{ width: `calc(${Math.max(0, Math.min(1, share))} * (100% - 6ch))` }} />
        <span className="pct num">{value}</span>
      </div>
    </div>
  );
}

/**
 * `all` shows every word and every written answer (the results page); without it a screen shows
 * the top 80 words and the newest 60 answers. `mine` are the options this person picked, marked on a phone.
 */
export function PollResults({ poll, tally, texts = [], all, mine }: { poll: Poll; tally: Tally | null; texts?: { text: string }[]; all?: boolean; mine?: string[] }) {
  const t = tally ?? { people: 0, counts: {} };
  const count = (id: string) => Math.max(0, t.counts[id] ?? 0);

  if (poll.type === 'choice') {
    const max = Math.max(1, ...poll.options.map((o) => count(o.id)));
    const top = Math.max(...poll.options.map((o) => count(o.id)));
    return (
      <div className="bars">
        {poll.options.map((o) => (
          <Bar key={o.id} value={`${pct(count(o.id), t.people)}%`} share={count(o.id) / max} lead={top > 0 && count(o.id) === top}
            label={mine?.includes(o.id) ? <span className="row">{o.label}<Icon name="user" label="Your answer" /></span> : o.label} />
        ))}
      </div>
    );
  }
  if (poll.type === 'ranking') {
    const ranked = [...poll.options].sort((a, b) => count(b.id) - count(a.id));
    const max = Math.max(1, ...ranked.map((o) => count(o.id)));
    return (
      <div className="bars">
        {ranked.map((o, i) => <Bar key={o.id} label={<><span className="num">{i + 1}.</span> {o.label}</>} value={String(count(o.id))} share={count(o.id) / max} lead={i === 0 && count(o.id) > 0} />)}
      </div>
    );
  }
  if (poll.type === 'rating') {
    const values = Array.from({ length: poll.max }, (_, i) => i + 1);
    const max = Math.max(1, ...values.map((v) => count(String(v))));
    const sum = values.reduce((a, v) => a + v * count(String(v)), 0);
    return (
      <div className="stack" style={{ gap: 'inherit' }}>
        <div className="average num">{t.people ? (sum / t.people).toFixed(1) : '–'} <span className="muted" style={{ fontSize: '0.4em', fontWeight: 400 }}>/ {poll.max}</span></div>
        <div className="bars">
          {values.map((v) => (
            <Bar key={v} share={count(String(v)) / max} value={String(count(String(v)))}
              label={<span className="num">{v}{v === 1 && poll.lowLabel ? ` · ${poll.lowLabel}` : ''}{v === poll.max && poll.highLabel ? ` · ${poll.highLabel}` : ''}</span>} />
          ))}
        </div>
      </div>
    );
  }
  if (poll.type === 'wordcloud') {
    const words = Object.entries(t.counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, all ? undefined : 80);
    const top = words[0]?.[1] ?? 1;
    return (
      <div className="cloud">
        {words.map(([w, n]) => <span key={w} style={{ fontSize: `${1 + (n / top) * 2.4}em`, fontWeight: n === top ? 700 : 500, opacity: 0.6 + (n / top) * 0.4 }}>{w}</span>)}
      </div>
    );
  }
  return <div className="texts">{[...texts].reverse().slice(0, all ? undefined : 60).map((x, i) => <div key={i}>{x.text}</div>)}</div>;
}

/** A quiz question's options: plain while it is open, with how people voted once time is up, and the correct one marked once revealed. */
export function QuizResults({ question, tally, spread, correct }: { question: QuizQuestion; tally: Tally | null; spread: boolean; correct?: string }) {
  const t = tally ?? { people: 0, counts: {} };
  const max = Math.max(1, ...question.options.map((o) => t.counts[o.id] ?? 0));
  return (
    <div className="bars">
      {question.options.map((o, i) => {
        const n = t.counts[o.id] ?? 0;
        const label = <><span className="letter num">{LETTERS[i]}</span> {o.label}{correct === o.id && ' ✓'}</>;
        return spread
          ? <Bar key={o.id} label={label} value={String(n)} share={n / max} mark={correct === o.id ? 'correct' : undefined} />
          : <div key={o.id} className="bar"><span>{label}</span></div>;
      })}
    </div>
  );
}
