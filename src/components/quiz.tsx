'use client';
/**
 * The quiz on the phone and on the big screen. The facilitator's screen reuses the big screen's
 * pieces. Every countdown runs on the server's clock.
 */
import { useEffect, useState } from 'react';
import { Icon } from './icons';
import { QuizResults } from './results';
import { quizPhase, type BoardEntry } from '@/lib/engine/quiz';
import { LIMITS } from '@/lib/limits';
import type { Answer, QuizQuestion, QuizState, Tally } from '@/lib/types';

const LETTERS = ['A', 'B', 'C', 'D'];
const num = (n: number) => n.toLocaleString('en-US');

/**
 * The server's time now, ticking. `serverNow` is the server's clock when the view was made;
 * the difference from this device's clock is kept, so a phone with a wrong clock still counts down right.
 */
export function useServerClock(serverNow: number | undefined): number {
  const [offset, setOffset] = useState<number | null>(null);
  const [now, setNow] = useState(() => serverNow ?? Date.now());
  /* A reply that took longer to arrive makes the server look further behind than it is. The
     largest difference seen is the closest to the truth, and keeping it stops the countdown stepping back. */
  useEffect(() => {
    if (serverNow !== undefined) setOffset((cur) => Math.max(cur ?? -Infinity, serverNow - Date.now()));
  }, [serverNow]);
  useEffect(() => {
    const tick = () => setNow(Date.now() + (offset ?? 0));
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

/** Whole seconds left on the question in play. */
export const secondsLeft = (q: QuizState, now: number) => Math.max(0, Math.ceil((q.closesAt - now) / 1000));

export interface Me { rank: number | null; total: number; last: number; players: number }
export interface Board { entries: BoardEntry[]; players: number; final: boolean }

const move = (e: BoardEntry) => (e.prevRank > e.rank ? `▲ ${e.prevRank - e.rank}` : e.prevRank < e.rank ? `▼ ${e.rank - e.prevRank}` : '');

/** The standings: rank, name, movement since the last question, points. */
export function Leaderboard({ entries }: { entries: BoardEntry[] }) {
  return (
    <div className="list">
      {entries.map((e, i) => (
        <div key={i} className={`board-row ${e.rank === 1 ? 'first' : ''}`}>
          <span className="num strong">{e.rank}</span>
          <span className="truncate">{e.nickname}</span>
          <span className="num faint">{move(e)}</span>
          <span className="num strong">{num(e.total)}</span>
        </div>
      ))}
    </div>
  );
}

/** The phone during a quiz: give a name, wait in the lobby, tap an answer, see the points, see the final place. */
export function QuizPhone({ title, count, question, q, now, mine, me, top, people, nickname, onName, onSend }: {
  title: string;
  count: number;
  question: QuizQuestion | null;
  q: QuizState;
  now: number;
  mine: Answer[];
  me?: Me;
  top?: BoardEntry[];
  people?: number;
  nickname: string;
  onName: (name: string) => Promise<string | null>;
  onSend: (answer: unknown) => Promise<string | null>;
}) {
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  /* A new question starts with nothing picked. */
  useEffect(() => {
    setSent(null);
    setErr(null);
  }, [question?.id]);

  const phase = quizPhase(q, now);
  const header = (
    <div className="poll-label">
      <span><Icon name="quiz" />{title || 'Quiz'}</span>
      {question && phase !== 'board' ? <span className="num">{q.index + 1} / {count}</span> : people !== undefined && <span className="num"><Icon name="user" />{people}</span>}
    </div>
  );

  /* A player needs a name before the first answer; the leaderboard shows it. */
  if (!nickname) {
    return (
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const problem = await onName(name.trim());
        setBusy(false);
        if (problem) setErr(problem);
      }}>
        {header}
        <label>Your name<input value={name} maxLength={LIMITS.nicknameChars} autoFocus onChange={(e) => setName(e.target.value)} /></label>
        {err && <p className="error small" role="alert">{err}</p>}
        <button type="submit" className="primary wide" disabled={busy || !name.trim()}>Join quiz</button>
      </form>
    );
  }

  if (phase === 'lobby' || !question) {
    return (
      <div className="stack">
        {header}
        <div className="card notice"><span className="avatar">{nickname.charAt(0).toUpperCase()}</span>{nickname}</div>
        {people !== undefined && <span className="muted num">{people} joined</span>}
      </div>
    );
  }

  if (phase === 'board') {
    return (
      <div className="stack">
        {header}
        {me && (
          <div className="result-line">
            <div><span className="small muted">Rank</span><b className="num">{me.rank ?? '–'} / {me.players}</b></div>
            <div><span className="small muted">Points</span><b className="num">{num(me.total)}</b></div>
            <div><span className="small muted">Last</span><b className="num">+{num(me.last)}</b></div>
          </div>
        )}
        {top && <Leaderboard entries={top} />}
      </div>
    );
  }

  const fromServer = mine.find((a) => a.type === 'quiz');
  const picked = fromServer?.type === 'quiz' ? fromServer.optionId : sent;
  const correct = q.correct;
  const pick = async (id: string) => {
    setBusy(true);
    setErr(null);
    const e = await onSend({ optionId: id });
    setBusy(false);
    if (e && !/already/.test(e)) setErr(e);
    else setSent(id);
  };

  return (
    <div className="stack">
      {header}
      <div className="spread">
        <div className="poll-title grow">{question.title}</div>
        {phase === 'open' && <div className="timer num" aria-label="Seconds left">{secondsLeft(q, now)}</div>}
      </div>
      <div className="list">
        {question.options.map((o, i) => (
          <button type="button" key={o.id} aria-pressed={picked === o.id}
            className={`option ${picked === o.id ? 'picked' : ''} ${phase === 'revealed' && correct === o.id ? 'correct' : ''}`}
            disabled={phase !== 'open' || busy || !!picked} onClick={() => pick(o.id)}>
            <span className="letter num">{LETTERS[i]}</span>
            <span className="grow">{o.label}</span>
            {phase === 'revealed' && correct === o.id && <Icon name="check" label="Correct answer" />}
          </button>
        ))}
      </div>
      {err && <p className="error small" role="alert">{err}</p>}
      {phase === 'open' && picked && <span className="row strong"><Icon name="check" />Sent</span>}
      {phase === 'closed' && <span className="row strong"><Icon name={picked ? 'check' : 'lock'} />{picked ? 'Sent' : 'Time is up'}</span>}
      {phase === 'revealed' && (
        <>
          <div className="strong">{!picked ? 'No answer' : picked === correct ? 'Correct' : 'Incorrect'}</div>
          {me && (
            <div className="result-line">
              <div><span className="small muted">Earned</span><b className="num">+{num(me.last)}</b></div>
              <div><span className="small muted">Points</span><b className="num">{num(me.total)}</b></div>
              <div><span className="small muted">Rank</span><b className="num">{me.rank ?? '–'} / {me.players}</b></div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The big screen during a quiz: who has joined, the question with its countdown, how people voted, the answer, the leaderboard. */
export function QuizWall({ title, count, question, q, now, tally, board, people }: {
  title: string;
  count: number;
  question: QuizQuestion | null;
  q: QuizState;
  now: number;
  tally: Tally | null;
  board: Board | null;
  people: number;
}) {
  const phase = quizPhase(q, now);
  if (phase === 'lobby' || !question) {
    return (
      <div className="panel">
        <h1>{title || 'Quiz'}</h1>
        <div className="average num">{people} <span className="muted" style={{ fontSize: '0.4em', fontWeight: 400 }}>joined</span></div>
      </div>
    );
  }
  if (phase === 'board') {
    return (
      <div className="panel">
        <h1>{board?.final ? title || 'Quiz' : 'Leaderboard'}</h1>
        {board && <Leaderboard entries={board.entries} />}
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <h1 className="grow">{question.title}</h1>
        {phase === 'open' && <div className="timer num" aria-label="Seconds left">{secondsLeft(q, now)}</div>}
      </div>
      <QuizResults question={question} tally={tally} spread={phase !== 'open'} correct={phase === 'revealed' ? q.correct : undefined} />
      <span className="muted num note">{q.index + 1} / {count} · {tally?.people ?? 0} answered</span>
    </div>
  );
}
