'use client';
/**
 * Q&A on its three screens: the phone (ask, upvote), the big screen (the question being answered
 * and the top questions) and the control view (the moderation queue).
 */
import { useCallback, useEffect, useState } from 'react';
import { savedName, saveName } from '@/lib/audience';
import { authed } from '@/lib/auth/client';
import { sortQuestions, type PublicQuestion, type QuestionOrder } from '@/lib/engine/questions';
import { LIMITS } from '@/lib/limits';
import { qaChannel, type PushEvent } from '@/lib/push/events';
import { useLive } from '@/lib/use-live';
import type { QaSlide, SessionState } from '@/lib/types';

interface MyQuestion extends PublicQuestion { mine: boolean; voted: boolean }


const who = (q: { name: string }) => q.name || 'Anonymous';

function OrderTabs({ order, onChange }: { order: QuestionOrder; onChange: (o: QuestionOrder) => void }) {
  return (
    <div className="row" role="group" aria-label="Order">
      <button type="button" className={order === 'top' ? 'on' : ''} aria-pressed={order === 'top'} onClick={() => onChange('top')}>Top</button>
      <button type="button" className={order === 'recent' ? 'on' : ''} aria-pressed={order === 'recent'} onClick={() => onChange('recent')}>Recent</button>
    </div>
  );
}

/** The phone: an ask box and the list of questions, each with an upvote. */
export function QaPhone({ sessionId, slide, token, state, closed }: { sessionId: string; slide: QaSlide; token: string; state: SessionState; closed: boolean }) {
  const base = `/api/live/${sessionId}/qa/${slide.id}`;
  const load = useCallback(async () => {
    const r = await fetch(`${base}?t=${token}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('Connection lost');
    return ((await r.json()) as { questions: MyQuestion[] }).questions;
  }, [base, token]);

  /* A pushed question carries no "mine" or "voted"; those are kept from what this phone already has. */
  const apply = useCallback((cur: MyQuestion[], e: PushEvent): MyQuestion[] => {
    if (e.kind !== 'qa' || e.slideId !== slide.id) return cur;
    const had = cur.find((q) => q.id === e.q.id);
    if (e.q.text === undefined) {
      if (had?.mine && e.q.status === 'pending') return cur;
      return cur.filter((q) => q.id !== e.q.id);
    }
    const next: MyQuestion = { ...(e.q as PublicQuestion), mine: had?.mine ?? false, voted: had?.voted ?? false };
    return had ? cur.map((q) => (q.id === next.id ? next : q)) : [...cur, next];
  }, [slide.id]);

  const { data, setData, refresh } = useLive<MyQuestion[]>(load, [qaChannel(sessionId, slide.id)], apply);
  const [order, setOrder] = useState<QuestionOrder>('top');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setName(savedName()), []);

  const post = (url: string, body: Record<string, unknown>) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, ...body }) });

  const send = async () => {
    setBusy(true);
    setErr(null);
    const r = await post(base, { text, anonymous: slide.anonymous && anonymous, nickname: name });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? 'Not sent');
    saveName(name);
    setText('');
    setData((cur) => (cur && !cur.some((q) => q.id === j.question.id) ? [...cur, j.question] : cur));
  };

  const vote = async (q: MyQuestion) => {
    setData((cur) => cur?.map((x) => (x.id === q.id ? { ...x, voted: true, votes: x.votes + 1 } : x)) ?? cur);
    const r = await post(`${base}/${q.id}/vote`, {});
    if (!r.ok && r.status !== 409) void refresh();
  };

  const list = sortQuestions(data ?? [], order);
  return (
    <div className="stack">
      {closed ? <p className="muted">Questions closed</p> : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <textarea rows={3} value={text} maxLength={LIMITS.questionChars} disabled={busy} onChange={(e) => setText(e.target.value)} aria-label="Your question" />
          {slide.anonymous && (
            <label className="check"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />Ask anonymously</label>
          )}
          {!(slide.anonymous && anonymous) && (
            <label>Name<input value={name} maxLength={LIMITS.nicknameChars} disabled={busy} onChange={(e) => setName(e.target.value)} /></label>
          )}
          <button type="submit" className="primary" disabled={busy || !text.trim()}>Ask</button>
          {err && <p className="error small" role="alert">{err}</p>}
        </form>
      )}

      {list.length > 0 && <OrderTabs order={order} onChange={setOrder} />}
      <div className="list" aria-live="polite">
        {list.map((q) => (
          <div key={q.id} className={`question ${state.highlight === q.id ? 'on' : ''}`}>
            <div className="stack" style={{ gap: 4 }}>
              <span>{q.text}</span>
              <span className="muted small">
                {who(q)}
                {q.status === 'pending' && ' · Waiting for approval'}
                {q.status === 'answered' && ' · Answered'}
                {state.highlight === q.id && ' · Answering now'}
              </span>
            </div>
            <button type="button" className={`num ${q.voted ? 'on' : ''}`} aria-pressed={q.voted} aria-label={`Upvote, ${q.votes}`}
              disabled={closed || q.voted || q.status !== 'live'} onClick={() => vote(q)}>▲ {q.votes}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The big screen: the question being answered, large, and the top questions with their votes. */
export function QaScreen({ questions, state }: { questions: PublicQuestion[]; state: SessionState }) {
  const live = sortQuestions(questions.filter((q) => q.status === 'live'), 'top');
  const now = live.find((q) => q.id === state.highlight);
  const rest = live.filter((q) => q.id !== state.highlight).slice(0, now ? 5 : 8);
  return (
    <div className="stack" style={{ gap: 24 }}>
      {now && (
        <div className="qa-now">
          <div>{now.text}</div>
          <div className="muted qa-meta">{who(now)} · <span className="num">▲ {now.votes}</span></div>
        </div>
      )}
      <div className="list">
        {rest.map((q) => (
          <div key={q.id} className="question">
            <div className="stack" style={{ gap: 4 }}>
              <span>{q.text}</span>
              <span className="muted qa-meta">{who(q)}</span>
            </div>
            <span className="num">▲ {q.votes}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The control view: questions waiting for approval, then the approved ones, then the answered. */
export function QaModeration({ sessionId, slide, questions, state, onChange }: {
  sessionId: string;
  slide: QaSlide;
  questions: PublicQuestion[];
  state: SessionState;
  onChange: (q: PublicQuestion, state: SessionState) => void;
}) {
  const [order, setOrder] = useState<QuestionOrder>('top');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const act = async (q: PublicQuestion, action: string) => {
    setBusy(q.id);
    setErr(null);
    const r = await authed(`/api/sessions/${sessionId}/qa/${slide.id}/${q.id}`, { method: 'PATCH', body: JSON.stringify({ action }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return setErr(j.error ?? 'Not applied');
    onChange(j.question, j.state);
  };

  const waiting = sortQuestions(questions.filter((q) => q.status === 'pending'), 'recent').reverse();
  const approved = sortQuestions(questions.filter((q) => q.status === 'live'), order);
  const answered = sortQuestions(questions.filter((q) => q.status === 'answered'), 'recent');

  const row = (q: PublicQuestion, actions: [string, string][]) => (
    <div key={q.id} className={`question ${state.highlight === q.id ? 'on' : ''}`}>
      <div className="stack" style={{ gap: 4 }}>
        <span>{q.text}</span>
        <span className="muted small">{who(q)} · <span className="num">▲ {q.votes}</span></span>
      </div>
      <div className="row">
        {actions.map(([action, label]) => (
          <button key={action} type="button" className={action === 'hide' ? 'danger' : ''} disabled={busy === q.id} onClick={() => act(q, action)}>{label}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="stack">
      {err && <p className="error" role="alert">{err}</p>}
      {slide.moderation && (
        <section className="stack" aria-label="Waiting">
          <div className="spread"><strong>Waiting</strong><span className="num muted">{waiting.length}</span></div>
          <div className="list">{waiting.map((q) => row(q, [['approve', 'Approve'], ['hide', 'Hide']]))}</div>
        </section>
      )}
      <section className="stack" aria-label="Approved">
        <div className="spread">
          <div className="row"><strong>Approved</strong><span className="num muted">{approved.length}</span></div>
          <OrderTabs order={order} onChange={setOrder} />
        </div>
        <div className="list">
          {approved.map((q) => row(q, [
            state.highlight === q.id ? ['unhighlight', 'Remove highlight'] : ['highlight', 'Highlight'],
            ['answered', 'Mark answered'],
            ['hide', 'Hide'],
          ]))}
        </div>
      </section>
      <section className="stack" aria-label="Answered">
        <div className="spread"><strong>Answered</strong><span className="num muted">{answered.length}</span></div>
        <div className="list">{answered.map((q) => row(q, [['hide', 'Hide']]))}</div>
      </section>
    </div>
  );
}
