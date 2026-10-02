'use client';
/**
 * Q&A on its three screens: the phone (ask, upvote, read replies), the big screen (the question
 * being answered and the top questions) and the facilitator's screen (review, reply, highlight).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { savedName, saveName } from '@/lib/audience';
import { authed } from '@/lib/auth/client';
import { sortQuestions, type PublicQuestion, type QuestionOrder } from '@/lib/engine/questions';
import { LIMITS } from '@/lib/limits';
import { post as postJson, request } from '@/lib/net';
import { qaChannel, type PushEvent } from '@/lib/push/events';
import { useLive } from '@/lib/use-live';
import type { QaSettings, SessionState } from '@/lib/types';

interface MyQuestion extends PublicQuestion { mine: boolean; voted: boolean }

const who = (q: { name: string }) => q.name || 'Anonymous';
const initial = (name: string) => (name ? name.trim().charAt(0).toUpperCase() : null);

/** How long ago, in the fewest words: "now", "4 min", "2 h", or the date. */
function ago(at: string): string {
  const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return new Date(at).toLocaleDateString();
}

function Avatar({ name }: { name: string }) {
  return <span className="avatar" aria-hidden>{initial(name) ?? <Icon name="user" />}</span>;
}

function Order({ order, onChange, count }: { order: QuestionOrder; onChange: (o: QuestionOrder) => void; count: number }) {
  return (
    <div className="spread">
      <button type="button" onClick={() => onChange(order === 'top' ? 'recent' : 'top')} aria-label="Change question order">
        <Icon name="sort" />{order === 'top' ? 'Popular' : 'Recent'}
      </button>
      <span className="row muted num">{count}<Icon name="chat" label="questions" /></span>
    </div>
  );
}

function Replies({ q }: { q: PublicQuestion }) {
  return (
    <>
      {q.replies.map((r) => (
        <div key={r.id} className="reply">
          <span className="by"><Icon name="reply" />Host<span className="tag">{ago(r.at)}</span></span>
          <span>{r.text}</span>
        </div>
      ))}
    </>
  );
}

/** The phone: the facilitator's announcement, the ask box, and the questions with their upvotes and replies. */
export function QaPhone({ sessionId, token, state, settings, nickname, ended }: {
  sessionId: string;
  token: string;
  state: SessionState;
  settings: QaSettings;
  nickname: string;
  ended: boolean;
}) {
  const base = `/api/live/${sessionId}/qa`;
  const load = useCallback(async () => {
    const r = await request(`${base}?t=${token}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('Connection lost');
    return ((await r.json()) as { questions: MyQuestion[] }).questions;
  }, [base, token]);

  /* A pushed question carries no "mine" or "voted"; those are kept from what this phone already has. */
  const apply = useCallback((cur: MyQuestion[], e: PushEvent): MyQuestion[] => {
    if (e.kind !== 'qa') return cur;
    const had = cur.find((q) => q.id === e.q.id);
    if (e.q.text === undefined) {
      if (had?.mine && e.q.status === 'pending') return cur;
      return cur.filter((q) => q.id !== e.q.id);
    }
    const next: MyQuestion = { ...(e.q as PublicQuestion), replies: e.q.replies ?? [], mine: had?.mine ?? false, voted: had?.voted ?? false };
    return had ? cur.map((q) => (q.id === next.id ? next : q)) : [...cur, next];
  }, []);

  const { data, setData, refresh } = useLive<MyQuestion[]>(load, [qaChannel(sessionId)], apply);
  const [order, setOrder] = useState<QuestionOrder>('top');
  const [text, setText] = useState('');
  const [name, setName] = useState(nickname);
  const [anonymous, setAnonymous] = useState(settings.anonymous);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /* The name follows the one this person has in the session, including a rename made from the top bar. */
  useEffect(() => {
    setName(nickname || savedName());
  }, [nickname]);

  const post = (url: string, body: Record<string, unknown>) => postJson(url, { token, ...body });

  const asAnonymous = settings.anonymous && anonymous;
  const send = async () => {
    setBusy(true);
    setErr(null);
    const r = await post(base, { text, anonymous: asAnonymous, nickname: name });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? 'Not sent');
    if (!asAnonymous) saveName(name);
    setText('');
    setData((cur) => (cur && !cur.some((q) => q.id === j.question.id) ? [...cur, j.question] : cur));
  };

  /* Upvotes tapped on this phone and still on their way, each with the count it had when tapped.
     The button shows them as counted at once, and a reload in between cannot take that back. */
  const [sent, setSent] = useState<Record<string, number>>({});
  const vote = async (q: MyQuestion) => {
    setSent((cur) => ({ ...cur, [q.id]: q.votes }));
    const r = await post(`${base}/${q.id}/vote`, {});
    const j = await r.json().catch(() => ({}));
    /* Counted now, or counted earlier (409): either way this person has voted. */
    if (r.ok || r.status === 409) {
      setData((cur) => cur?.map((x) => (x.id === q.id ? { ...x, voted: true, votes: r.ok ? Math.max(x.votes, Number(j.votes) || 0) : x.votes } : x)) ?? cur);
    }
    setSent((cur) => {
      const rest = { ...cur };
      delete rest[q.id];
      return rest;
    });
    if (!r.ok) void refresh();
  };
  const votedOn = (q: MyQuestion) => q.voted || sent[q.id] !== undefined;
  const votesOf = (q: MyQuestion) => (q.voted || sent[q.id] === undefined ? q.votes : Math.max(q.votes, sent[q.id] + 1));

  const list = sortQuestions(data ?? [], order);
  return (
    <div className="stack">
      {state.announcement && (
        <div className="announce" role="note">
          <span className="label"><Icon name="megaphone" />Announcement</span>
          <span>{state.announcement}</span>
        </div>
      )}

      {ended ? null : !state.qaOpen ? (
        <div className="card notice"><span className="dot"><Icon name="lock" /></span>Questions closed</div>
      ) : (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <textarea rows={3} value={text} maxLength={LIMITS.questionChars} disabled={busy} placeholder="Type your question" aria-label="Your question" onChange={(e) => setText(e.target.value)} />
          {!asAnonymous && <input value={name} maxLength={LIMITS.nicknameChars} disabled={busy} placeholder="Your name" aria-label="Your name" onChange={(e) => setName(e.target.value)} />}
          <div className="spread">
            {settings.anonymous
              ? <label className="check"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />Ask anonymously</label>
              : <span />}
            <button type="submit" className="primary" disabled={busy || !text.trim() || (!asAnonymous && !name.trim())}>Send</button>
          </div>
          {err && <p className="error small" role="alert">{err}</p>}
        </form>
      )}

      {data && <Order order={order} onChange={setOrder} count={list.length} />}
      <div className="list" aria-live="polite">
        {list.map((q) => (
          <article key={q.id} className={`question ${state.highlight === q.id ? 'highlighted' : ''}`}>
            <div className="head">
              <Avatar name={q.name} />
              <div className="who grow">
                <span className="name">{who(q)}</span>
                <span className="tag">
                  {ago(q.at)}
                  {q.status === 'pending' && ' · Waiting for review'}
                  {q.status === 'answered' && ' · Answered'}
                </span>
              </div>
              {state.highlight === q.id && <Icon name="pin" label="Being answered now" />}
              <button type="button" className="votes num" aria-pressed={votedOn(q)} aria-label={`Upvote, ${votesOf(q)}`}
                disabled={ended || votedOn(q) || q.status !== 'live'} onClick={() => vote(q)}>{votesOf(q)}<Icon name="thumb" /></button>
            </div>
            <div className="text">{q.text}</div>
            <Replies q={q} />
          </article>
        ))}
      </div>
    </div>
  );
}

/** The big screen: the question being answered in solid colour, then the others by votes. */
export function QaWall({ questions, state }: { questions: PublicQuestion[]; state: SessionState }) {
  const live = sortQuestions(questions.filter((q) => q.status === 'live'), 'top');
  const now = live.find((q) => q.id === state.highlight);
  const rest = live.filter((q) => q.id !== state.highlight).slice(0, now ? 4 : 5);
  const card = (q: PublicQuestion, highlighted: boolean) => (
    <div key={q.id} className={`wq ${highlighted ? 'highlighted' : ''}`}>
      <div className="head"><span className="row"><Avatar name={q.name} />{who(q)}</span><span className="row num">{q.votes}<Icon name="thumb" size={20} /></span></div>
      <div className="text">{q.text}</div>
    </div>
  );
  return <div className="list" style={{ gap: 14 }}>{now && card(now, true)}{rest.map((q) => card(q, false))}</div>;
}

/** The facilitator's screen: questions to review, the live ones, and the answered ones, each with its actions. */
export function QaHost({ sessionId, questions, state, moderation, ended, onChange }: {
  sessionId: string;
  questions: PublicQuestion[];
  state: SessionState;
  moderation: boolean;
  ended: boolean;
  onChange: (q: PublicQuestion, state: SessionState) => void;
}) {
  type Tab = 'review' | 'live' | 'answered';
  const pending = questions.filter((q) => q.status === 'pending');
  const [tab, setTab] = useState<Tab>('live');
  const [order, setOrder] = useState<QuestionOrder>('top');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [replying, setReplying] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  /* The first question ever to arrive for review brings its tab forward, once; after that the tabs stay where the facilitator put them. */
  const jumped = useRef(false);
  useEffect(() => {
    if (pending.length > 0 && !jumped.current) {
      jumped.current = true;
      setTab('review');
    }
  }, [pending.length]);

  const act = async (q: PublicQuestion, action: string, text?: string) => {
    setBusy(q.id);
    setErr(null);
    const r = await authed(`/api/sessions/${sessionId}/qa/${q.id}`, { method: 'PATCH', body: JSON.stringify({ action, text }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return setErr(j.error ?? 'Not applied');
    onChange(j.question, j.state);
    if (action === 'reply') {
      setReplying(null);
      setReply('');
    }
  };

  const lists: Record<Tab, PublicQuestion[]> = {
    review: sortQuestions(pending, 'recent').reverse(),
    live: sortQuestions(questions.filter((q) => q.status === 'live'), order),
    answered: sortQuestions(questions.filter((q) => q.status === 'answered'), 'recent'),
  };
  const actions: Record<Tab, (q: PublicQuestion) => [string, string][]> = {
    review: () => [['approve', 'Approve'], ['hide', 'Hide']],
    live: (q) => [state.highlight === q.id ? ['unhighlight', 'Remove highlight'] : ['highlight', 'Highlight'], ['answered', 'Mark answered'], ['hide', 'Hide']],
    answered: () => [['approve', 'Restore'], ['hide', 'Hide']],
  };
  const tabs: [Tab, string][] = [...(moderation || pending.length ? [['review', 'In review'] as [Tab, string]] : []), ['live', 'Live'], ['answered', 'Answered']];
  const shown = tabs.some(([t]) => t === tab) ? tab : 'live';

  return (
    <div className="stack">
      <div className="subtabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={shown === t} onClick={() => setTab(t)}>{label} <span className="count num">{lists[t].length}</span></button>
        ))}
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      {shown === 'live' && lists.live.length > 0 && <Order order={order} onChange={setOrder} count={lists.live.length} />}
      <div className="list">
        {lists[shown].map((q) => (
          <article key={q.id} className={`question ${state.highlight === q.id ? 'highlighted' : ''}`}>
            <div className="head">
              <Avatar name={q.name} />
              <div className="who grow"><span className="name">{who(q)}</span><span className="tag">{ago(q.at)}</span></div>
              <span className="votes num row" style={{ display: 'inline-flex', alignItems: 'center' }}>{q.votes}<Icon name="thumb" /></span>
            </div>
            <div className="text">{q.text}</div>
            <Replies q={q} />
            {replying === q.id && (
              <form className="stack" onSubmit={(e) => { e.preventDefault(); void act(q, 'reply', reply); }}>
                <textarea rows={2} value={reply} maxLength={LIMITS.replyChars} autoFocus aria-label="Your reply" onChange={(e) => setReply(e.target.value)} />
                <div className="row">
                  <button type="submit" className="primary" disabled={busy === q.id || !reply.trim()}>Send reply</button>
                  <button type="button" onClick={() => setReplying(null)}>Cancel</button>
                </div>
              </form>
            )}
            {!ended && replying !== q.id && (
              <div className="row">
                {actions[shown](q).map(([action, label]) => (
                  <button key={action} type="button" className={action === 'hide' ? 'danger' : ''} disabled={busy === q.id} onClick={() => act(q, action)}>{label}</button>
                ))}
                <button type="button" disabled={busy === q.id} onClick={() => { setReplying(q.id); setReply(''); }}><Icon name="reply" />Reply</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
