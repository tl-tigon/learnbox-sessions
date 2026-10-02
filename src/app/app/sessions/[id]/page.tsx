'use client';
import { use, useEffect, useState } from 'react';
import { authed } from '@/lib/auth/client';
import { Results } from '@/components/results';
import { useSignedIn } from '@/components/use-signed-in';
import { sortQuestions, type PublicQuestion } from '@/lib/engine/questions';
import type { BoardEntry } from '@/lib/engine/quiz';
import type { Slide, Tally } from '@/lib/types';

const STATUS = { pending: 'Waiting', live: 'Approved', answered: 'Answered', hidden: 'Hidden' } as const;

interface Data {
  session: { id: string; code: string; title: string; mode: string; createdAt: string; status: string };
  people: number;
  rows: { slide: Slide; tally: Tally; answers: { answer: { type: string; text?: string }; at: string }[]; questions: PublicQuestion[] }[];
  board: BoardEntry[];
}

export default function SessionResults({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const email = useSignedIn();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!email) return;
    authed(`/api/sessions/${id}/results`).then(async (r) => (r.ok ? setD(await r.json()) : setErr('Not found')));
  }, [email, id]);

  const download = async () => {
    const r = await authed(`/api/sessions/${id}/results?format=csv`);
    if (!r.ok) return setErr('Download failed');
    const blob = await r.blob();
    const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? 'results.csv';
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!email) return null;
  if (!d) return <main className="wrap"><p className={err ? 'error' : 'muted'}>{err ?? 'Loading…'}</p></main>;
  return (
    <main className="wrap stack">
      <div className="spread">
        <a href="/app">← Presentations</a>
        <button className="primary" onClick={download}>Download CSV</button>
      </div>
      <div className="spread">
        <h1>{d.session.title}</h1>
        <span className="muted num">{new Date(d.session.createdAt).toLocaleString()} · code {d.session.code} · {d.people} joined · {d.session.status === 'live' ? 'Live' : 'Ended'}</span>
      </div>
      {err && <p className="error">{err}</p>}
      {d.rows.map(({ slide, tally, answers, questions }, i) => (
        <section key={slide.id} className="card stack">
          <div className="spread">
            <h2>{i + 1}. {slide.title || '—'}</h2>
            <span className="num muted">{slide.type === 'qa' ? `${questions.length} questions` : `${tally.people} answered`}</span>
          </div>
          {slide.type === 'qa' ? (
            <div className="list">
              {sortQuestions(questions, 'top').map((q) => (
                <div key={q.id} className="question">
                  <div className="stack" style={{ gap: 4 }}>
                    <span>{q.text}</span>
                    <span className="muted small">{q.name || 'Anonymous'} · {STATUS[q.status]}</span>
                  </div>
                  <span className="num">▲ {q.votes}</span>
                </div>
              ))}
            </div>
          ) : (
            <Results slide={slide} tally={tally} texts={answers.map((a) => ({ text: a.answer.text ?? '' }))} />
          )}
        </section>
      ))}
      {d.board.length > 0 && (
        <section className="card stack">
          <div className="spread"><h2>Leaderboard</h2><span className="num muted">{d.board.length} players</span></div>
          <div className="list">
            {d.board.map((e, i) => (
              <div key={i} className="board-row">
                <span className="num">{e.rank}</span>
                <span>{e.nickname}</span>
                <span className="num">{e.total.toLocaleString('en-US')}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
