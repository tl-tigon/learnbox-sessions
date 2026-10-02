'use client';
/**
 * Q&A on its three screens: the phone (ask, upvote, read replies, take a question back), the big
 * screen (the question being answered and the top questions) and the facilitator's screen
 * (review, highlight, mark answered, reply).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Confirm, Dialog, Panel, Toast, type Ask } from './dialog';
import { Icon, type IconName } from './icons';
import { Menu } from './menu';
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
/** The time of day, as the facilitator's list shows it. */
const clock = (at: string) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function Avatar({ name, small }: { name: string; small?: boolean }) {
  return <span className={small ? 'avatar xs' : 'avatar'} aria-hidden>{initial(name) ?? <Icon name="user" size={small ? 10 : 16} />}</span>;
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

/**
 * The phone: the facilitator's announcement, the row that opens the ask sheet, and the questions
 * with their upvotes and replies. `onEngage` is told when this person has asked something.
 */
export function QaPhone({ sessionId, token, state, settings, nickname, ended, onEngage }: {
  sessionId: string;
  token: string;
  state: SessionState;
  settings: QaSettings;
  nickname: string;
  ended: boolean;
  onEngage?: () => void;
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
  /* The question being typed lives here, so it is still there after the sheet is closed or the phone shows a poll. */
  const [text, setText] = useState('');
  const [name, setName] = useState(nickname);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Ask | null>(null);
  /* The name follows the one this person has in the session, including a rename made from the top bar. */
  useEffect(() => {
    setName(nickname || savedName());
  }, [nickname]);

  const post = (url: string, body: Record<string, unknown>) => postJson(url, { token, ...body });

  /* Where anonymous questions are allowed, a question sent without a name is anonymous. */
  const asAnonymous = settings.anonymous && !name.trim();
  const send = async () => {
    setBusy(true);
    setErr(null);
    const r = await post(base, { text, anonymous: asAnonymous, nickname: name });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? 'Not sent');
    if (!asAnonymous) saveName(name.trim());
    setText('');
    setAsking(false);
    setToast(j.question.status === 'pending' ? 'Question sent for review' : 'Question sent');
    setData((cur) => (cur && !cur.some((q) => q.id === j.question.id) ? [...cur, j.question] : cur));
    onEngage?.();
  };

  const withdraw = async (q: MyQuestion) => {
    const r = await post(`${base}/${q.id}/withdraw`, {});
    if (r.ok || r.status === 404) {
      setData((cur) => cur?.filter((x) => x.id !== q.id) ?? cur);
      setToast('Question withdrawn');
    } else {
      setToast((await r.json().catch(() => ({}))).error ?? 'Not withdrawn');
      void refresh();
    }
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
  const canAsk = !ended && state.qaOpen;
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
        <button type="button" className="askrow" onClick={() => setAsking(true)}>
          <Avatar name={name} />
          <span className={`grow truncate ${text.trim() ? '' : 'faint'}`}>{text.trim() || 'Type your question'}</span>
        </button>
      )}

      {data && list.length > 0 && <Order order={order} onChange={setOrder} count={list.length} />}
      {data && list.length === 0 && <div className="none"><Icon name="chat" size={40} />No questions yet</div>}
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
            <div className="spread" style={{ alignItems: 'flex-start' }}>
              <div className="text grow">{q.text}</div>
              {q.mine && !ended && q.status !== 'answered' && (
                <Menu label="Your question" className="icon-btn ghost sm" trigger={<Icon name="more" />}>
                  <button className="danger" onClick={() => setConfirm({ title: 'Withdraw question', text: 'It is removed for everyone.', action: 'Withdraw', danger: true, run: () => void withdraw(q) })}><Icon name="trash" />Withdraw</button>
                </Menu>
              )}
            </div>
            <Replies q={q} />
          </article>
        ))}
      </div>

      {canAsk && <button type="button" className="fab primary" onClick={() => setAsking(true)}>Ask</button>}

      {asking && (
        <Dialog label="Ask" onClose={() => setAsking(false)}>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <textarea rows={4} value={text} maxLength={LIMITS.questionChars} disabled={busy} autoFocus placeholder="Type your question" aria-label="Your question" onChange={(e) => setText(e.target.value)} />
            <span className="small faint num" style={{ justifySelf: 'end' }}>{LIMITS.questionChars - text.length}</span>
            <div className="field-row">
              <Avatar name={name} />
              <input value={name} maxLength={LIMITS.nicknameChars} disabled={busy} placeholder={settings.anonymous ? 'Your name (optional)' : 'Your name'} aria-label="Your name" onChange={(e) => setName(e.target.value)} />
              <button type="submit" className="primary pill tall" disabled={busy || !canAsk || !text.trim() || (!settings.anonymous && !name.trim())}>Send</button>
            </div>
            {!canAsk && <p className="small muted">Questions closed</p>}
            {err && <p className="error small" role="alert">{err}</p>}
          </form>
        </Dialog>
      )}
      {confirm && <Confirm ask={confirm} onClose={() => setConfirm(null)} />}
      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
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

type Tab = 'review' | 'live' | 'answered';
const NOTHING: Record<Tab, string> = { review: 'Nothing to review', live: 'No questions yet', answered: 'No answered questions' };

/**
 * The facilitator's screen: questions to review, the live ones and the answered ones, as a plain
 * list. A question's actions sit in a small bar on its row; its replies open in a panel at the side.
 */
export function QaHost({ sessionId, questions, state, moderation, ended, onChange }: {
  sessionId: string;
  questions: PublicQuestion[];
  state: SessionState;
  moderation: boolean;
  ended: boolean;
  onChange: (q: PublicQuestion, state: SessionState) => void;
}) {
  const pending = questions.filter((q) => q.status === 'pending');
  const [tab, setTab] = useState<Tab>('live');
  const [order, setOrder] = useState<QuestionOrder>('top');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /* The question whose replies are open at the side, and the reply being typed for it. */
  const [thread, setThread] = useState<string | null>(null);
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
    if (action === 'reply') setReply('');
  };
  const openThread = (q: PublicQuestion) => {
    if (thread !== q.id) setReply('');
    setThread(q.id);
  };

  const lists: Record<Tab, PublicQuestion[]> = {
    review: sortQuestions(pending, 'recent').reverse(),
    live: sortQuestions(questions.filter((q) => q.status === 'live'), order),
    answered: sortQuestions(questions.filter((q) => q.status === 'answered'), 'recent'),
  };
  const tabs: [Tab, string][] = [...(moderation || pending.length ? [['review', 'In review'] as [Tab, string]] : []), ['live', 'Live'], ['answered', 'Answered']];
  const shown = tabs.some(([t]) => t === tab) ? tab : 'live';
  const open = questions.find((q) => q.id === thread) ?? null;

  const tool = (q: PublicQuestion, action: string, label: string, icon: IconName, filled = false) => (
    <button key={action} type="button" className={`icon-btn ghost sm ${filled ? 'fill' : ''}`} aria-label={label} title={label} disabled={busy === q.id} onClick={() => act(q, action)}><Icon name={icon} /></button>
  );
  const replyTool = (q: PublicQuestion) => (
    <button type="button" className="icon-btn ghost sm" aria-label="Reply" title="Reply" onClick={() => openThread(q)}><Icon name="chat" /></button>
  );
  const more = (q: PublicQuestion) => (
    <Menu label="More" className="icon-btn ghost sm" trigger={<Icon name="morev" />}>
      <button className="danger" disabled={busy === q.id} onClick={() => act(q, 'hide')}><Icon name="eyeoff" />Hide</button>
    </Menu>
  );
  /* The filled button is the usual next step: highlight a question, then mark it answered. */
  const tools = (q: PublicQuestion) => {
    const lit = state.highlight === q.id;
    if (shown === 'review') return <>{tool(q, 'approve', 'Approve', 'check', true)}{tool(q, 'hide', 'Hide', 'x')}</>;
    if (shown === 'answered') return <>{tool(q, 'approve', 'Restore', 'restore')}{replyTool(q)}{more(q)}</>;
    return <>{lit ? tool(q, 'unhighlight', 'Remove highlight', 'unpin') : tool(q, 'highlight', 'Highlight', 'pin', true)}{tool(q, 'answered', 'Mark answered', 'check', lit)}{replyTool(q)}{more(q)}</>;
  };
  const replies = (n: number) => (n === 1 ? '1 reply' : `${n} replies`);

  return (
    <div className="stack">
      <div className="spread">
        <div className="qtabs" role="tablist">
          {tabs.map(([t, label]) => (
            <button key={t} role="tab" aria-selected={shown === t} onClick={() => setTab(t)}>{label}<span className="badge num">{lists[t].length}</span></button>
          ))}
        </div>
        {shown === 'live' && lists.live.length > 1 && (
          <button type="button" className="ghost small" aria-label="Change question order" onClick={() => setOrder(order === 'top' ? 'recent' : 'top')}><Icon name="sort" />{order === 'top' ? 'Popular' : 'Recent'}</button>
        )}
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      {lists[shown].length === 0 && <div className="none"><Icon name="chat" size={40} />{NOTHING[shown]}</div>}
      <div className="qlist">
        {lists[shown].map((q) => (
          <article key={q.id} className={`qrow ${state.highlight === q.id ? 'highlighted' : ''}`}>
            <div className="meta"><Avatar name={q.name} small /><span>{who(q)}</span><span className="num">{clock(q.at)}</span></div>
            <div className="text">{q.text}</div>
            <span className="qvotes num">{q.votes}<Icon name="thumb" /></span>
            {q.replies.length > 0 && <button type="button" className="ghost link" onClick={() => openThread(q)}><Icon name="chat" />{replies(q.replies.length)}</button>}
            {!ended && <div className="qtools">{tools(q)}</div>}
          </article>
        ))}
      </div>

      {open && (
        <Panel label="Reply" onClose={() => setThread(null)} foot={!ended && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void act(open, 'reply', reply); }}>
            <textarea rows={3} value={reply} maxLength={LIMITS.replyChars} autoFocus placeholder="Write your reply" aria-label="Your reply" onChange={(e) => setReply(e.target.value)} />
            <button type="submit" className="primary tall" disabled={busy === open.id || !reply.trim() || open.replies.length >= LIMITS.repliesPerQuestion}><Icon name="send" />Send</button>
          </form>
        )}>
          <article className="qrow plain">
            <div className="meta"><Avatar name={open.name} small /><span>{who(open)}</span><span className="num">{clock(open.at)}</span></div>
            <div className="text">{open.text}</div>
            <span className="qvotes num">{open.votes}<Icon name="thumb" /></span>
          </article>
          {open.replies.length > 0 && <div className="divider small muted num">{replies(open.replies.length)}</div>}
          {open.replies.map((r) => (
            <article key={r.id} className="qrow plain">
              <div className="meta"><Avatar name="Host" small /><span>Host</span><span className="num">{clock(r.at)}</span></div>
              <div className="text">{r.text}</div>
            </article>
          ))}
        </Panel>
      )}
    </div>
  );
}
