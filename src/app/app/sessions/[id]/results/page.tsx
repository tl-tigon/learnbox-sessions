'use client';
/** A session's results: every poll and quiz question, each quiz's leaderboard, and the audience's questions. */
import { use, useEffect, useState } from 'react';
import { Icon, TYPE_ICON, TYPE_LABEL } from '@/components/icons';
import { Leaderboard } from '@/components/quiz';
import { PollResults, QuizResults } from '@/components/results';
import { useSignedIn } from '@/components/use-signed-in';
import { authed } from '@/lib/auth/client';
import { sortQuestions, type PublicQuestion } from '@/lib/engine/questions';
import type { BoardEntry } from '@/lib/engine/quiz';
import type { Poll, QuizQuestion, Tally } from '@/lib/types';

type Item =
  | { kind: 'poll'; group: string | null; poll: Poll; tally: Tally; answers: { answer: { type: string; text?: string }; at: string }[] }
  | { kind: 'quiz-question'; quiz: string; question: QuizQuestion; tally: Tally }
  | { kind: 'board'; quiz: string; board: BoardEntry[] };

interface Data {
  session: { id: string; code: string; title: string; createdAt: string; status: string };
  people: number;
  items: Item[];
  questions: PublicQuestion[];
  /** Whether the account's plan has downloads. */
  downloads: boolean;
}

const STATUS = { pending: 'Waiting', live: 'Approved', answered: 'Answered', hidden: 'Hidden' } as const;

export default function SessionResults({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const email = useSignedIn();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!email) return;
    authed(`/api/sessions/${id}/results`).then(async (r) => (r.ok ? setD(await r.json()) : setErr('Not found')));
  }, [email, id]);

  const download = async (format: 'csv' | 'xlsx') => {
    const r = await authed(`/api/sessions/${id}/results?format=${format}`);
    if (!r.ok) return setErr('Download failed');
    const blob = await r.blob();
    const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? `results.${format}`;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    a.click();
    /* Some browsers start the download a moment after the click, so the address is kept until then. */
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  if (!email) return null;
  if (!d) return <main className="narrow"><p className={err ? 'error' : 'muted'}>{err ?? 'Loading…'}</p></main>;
  let n = 0;
  return (
    <div className="apppage">
      <header className="apphead">
        <a className="btn round" href={`/app/sessions/${id}`} aria-label="Back to the session"><Icon name="left" /></a>
        <span className="headtitle grow truncate">{d.session.title}</span>
        {d.downloads ? (
          <>
            <button className="tall" onClick={() => download('xlsx')}><Icon name="download" />Download Excel</button>
            <button className="primary tall" onClick={() => download('csv')}><Icon name="download" />Download CSV</button>
          </>
        ) : <a className="btn tall" href="/app/account"><Icon name="download" />Downloads are on Pro</a>}
      </header>
      <main className="wrap stack" style={{ maxWidth: 760 }}>
        <span className="tag num">{new Date(d.session.createdAt).toLocaleString()} · # {d.session.code} · {d.people} joined · {d.session.status === 'live' ? 'Live' : 'Ended'}</span>
        {err && <p className="error">{err}</p>}

        {d.items.map((item, i) => {
          if (item.kind === 'board') {
            return item.board.length === 0 ? null : (
              <section key={i} className="card stack">
                <div className="spread"><h2>Leaderboard · {item.quiz}</h2><span className="tag num">{item.board.length} players</span></div>
                <Leaderboard entries={item.board} />
              </section>
            );
          }
          n += 1;
          const tally = item.tally;
          return (
            <section key={i} className="card stack">
              <div className="poll-label">
                {item.kind === 'poll'
                  ? <span><Icon name={TYPE_ICON[item.poll.type]} />{TYPE_LABEL[item.poll.type]}{item.group && ` · ${item.group}`}</span>
                  : <span><Icon name="quiz" />{item.quiz}</span>}
                <span className="num">{tally.people} answered</span>
              </div>
              <h2><span className="num faint">{n}.</span> {(item.kind === 'poll' ? item.poll.title : item.question.title) || 'Untitled'}</h2>
              {item.kind === 'poll'
                ? <PollResults poll={item.poll} tally={tally} texts={item.answers.map((a) => ({ text: a.answer.text ?? '' }))} all />
                : <QuizResults question={item.question} tally={tally} spread correct={item.question.correctId} />}
            </section>
          );
        })}

        {d.questions.length > 0 && (
          <section className="card stack">
            <div className="spread"><h2>Q&A</h2><span className="tag num">{d.questions.length} questions</span></div>
            <div className="list">
              {sortQuestions(d.questions, 'top').map((q) => (
                <article key={q.id} className="question">
                  <div className="head">
                    <div className="who grow"><span className="name">{q.name || 'Anonymous'}</span><span className="tag">{STATUS[q.status]}</span></div>
                    <span className="row num muted">{q.votes}<Icon name="thumb" /></span>
                  </div>
                  <div className="text">{q.text}</div>
                  {q.replies.map((r) => <div key={r.id} className="reply"><span className="by"><Icon name="reply" />Host</span><span>{r.text}</span></div>)}
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
