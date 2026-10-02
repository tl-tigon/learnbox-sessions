'use client';
/**
 * The quiz on its screens: the phone (lobby, answer buttons, result, place), the big screen
 * (question with countdown, reveal, leaderboard, podium). The control view reuses the big
 * screen's pieces. Every countdown runs on the server's clock.
 */
import { useEffect, useState } from 'react';
import { quizPhase, type BoardEntry } from '@/lib/engine/quiz';
import type { Answer, QuizSlide, SessionState, Tally } from '@/lib/types';

const LETTERS = ['A', 'B', 'C', 'D'];
const num = (n: number) => n.toLocaleString('en-US');

/**
 * The server's time now, ticking. `serverNow` is the server's clock when the view was made;
 * the difference from this device's clock is kept, so a phone with a wrong clock still counts down right.
 */
export function useServerClock(serverNow: number | undefined): number {
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => serverNow ?? Date.now());
  useEffect(() => {
    if (serverNow !== undefined) setOffset(serverNow - Date.now());
  }, [serverNow]);
  useEffect(() => {
    const tick = () => setNow(Date.now() + offset);
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

/** Whole seconds left on the question in play. */
const secondsLeft = (state: SessionState, now: number) => Math.max(0, Math.ceil(((state.quiz?.closesAt ?? 0) - now) / 1000));

export interface Me { rank: number | null; total: number; last: number; players: number }

/** The phone on a quiz question. A tap on an option sends it; one answer per question. */
export function QuizPhone({ slide, state, now, mine, me, people, nickname, onSend }: {
  slide: QuizSlide;
  state: SessionState;
  now: number;
  mine: Answer[];
  me?: Me;
  people?: number;
  nickname: string;
  onSend: (answer: unknown) => Promise<string | null>;
}) {
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const phase = quizPhase(state, slide.id, now);
  const fromServer = mine.find((a) => a.type === 'quiz');
  const picked = fromServer?.type === 'quiz' ? fromServer.optionId : sent;
  const correct = state.quiz?.correct;

  if (phase === 'ready') {
    return (
      <div className="stack">
        <strong>{nickname}</strong>
        {people !== undefined && <span className="muted num">{people} players</span>}
      </div>
    );
  }

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
      {phase === 'open' && <div className="timer num" aria-label="Seconds left">{secondsLeft(state, now)}</div>}
      <div className="quiz-options">
        {slide.options.map((o, i) => (
          <button type="button" key={o.id} aria-pressed={picked === o.id}
            className={`opt ${picked === o.id ? 'on' : ''} ${phase === 'revealed' && correct === o.id ? 'correct' : ''}`}
            disabled={phase !== 'open' || busy || !!picked} onClick={() => pick(o.id)}>
            <span className="letter num">{LETTERS[i]}</span>
            <span>{o.label}</span>
            {phase === 'revealed' && correct === o.id && <span aria-label="Correct answer">✓</span>}
          </button>
        ))}
      </div>
      {err && <p className="error small" role="alert">{err}</p>}
      {phase === 'open' && picked && <p className="muted">Sent</p>}
      {phase === 'closed' && <p className="muted">{picked ? 'Sent' : 'Time is up'}</p>}
      {phase === 'revealed' && (
        <div className="stack">
          <strong>{!picked ? 'No answer' : picked === correct ? 'Correct' : 'Incorrect'}</strong>
          {me && (
            <div className="spread num">
              <span>+{num(me.last)}</span>
              <span>Total {num(me.total)}</span>
              <span>Rank {me.rank ?? '–'} / {me.players}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The phone on a leaderboard slide: this player's place, and the top three on the final one. */
export function LeaderboardPhone({ me, top }: { me?: Me; top?: BoardEntry[] }) {
  if (!me) return null;
  return (
    <div className="stack">
      <div className="spread num">
        <span>Rank {me.rank ?? '–'} / {me.players}</span>
        <span>{num(me.total)} points</span>
      </div>
      {top && (
        <div className="list">
          {top.map((e, i) => (
            <div key={i} className="board-row">
              <span className="num">{e.rank}</span>
              <span>{e.nickname}</span>
              <span className="num">{num(e.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The big screen on a quiz question: players waiting, then the options with a countdown, then the reveal. */
export function QuizScreen({ slide, state, now, tally, people }: { slide: QuizSlide; state: SessionState; now: number; tally: Tally | null; people: number }) {
  const phase = quizPhase(state, slide.id, now);
  if (phase === 'ready') return <div className="num muted" style={{ fontSize: '1.6em' }}>{people} players</div>;
  const counts = tally?.counts ?? {};
  const max = Math.max(1, ...slide.options.map((o) => counts[o.id] ?? 0));
  return (
    <div className="stack" style={{ gap: 24 }}>
      {phase !== 'revealed' && <div className="timer num" aria-label="Seconds left">{secondsLeft(state, now)}</div>}
      <div className="bars">
        {slide.options.map((o, i) => {
          const n = counts[o.id] ?? 0;
          const right = phase === 'revealed' && o.id === slide.correctId;
          return (
            <div className={`bar ${right ? 'correct' : ''}`} key={o.id}>
              <div className="spread">
                <span><span className="letter num">{LETTERS[i]}</span> {o.label}{right && ' ✓'}</span>
                {phase === 'revealed' && <span className="num">{n}</span>}
              </div>
              {phase === 'revealed' && <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / max) * 100}%` }} /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const move = (e: BoardEntry) => (e.prevRank > e.rank ? `▲ ${e.prevRank - e.rank}` : e.prevRank < e.rank ? `▼ ${e.rank - e.prevRank}` : '–');

/** The standings: the top players with their points and their rise or fall. The final one opens with a podium. */
export function LeaderboardScreen({ board }: { board: { entries: BoardEntry[]; players: number; final: boolean } }) {
  const podium = board.final ? board.entries.slice(0, 3) : [];
  const rest = board.final ? board.entries.slice(3) : board.entries;
  return (
    <div className="stack" style={{ gap: 24 }}>
      {podium.length > 0 && (
        <div className="podium">
          {podium.map((e, i) => (
            <div key={i} className={`place place-${i + 1}`}>
              <span className="num rank">{e.rank}</span>
              <strong>{e.nickname}</strong>
              <span className="num">{num(e.total)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="list">
        {rest.map((e, i) => (
          <div key={i} className="board-row">
            <span className="num">{e.rank}</span>
            <span>{e.nickname}</span>
            <span className="num muted">{move(e)}</span>
            <span className="num">{num(e.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
