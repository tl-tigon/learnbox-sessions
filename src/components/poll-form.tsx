'use client';
/**
 * What a person fills in on their phone. `PollField` is one poll's inputs; `PollForm` is a poll
 * on its own with its Send button; `SurveyForm` is several polls sent together.
 */
import { useEffect, useState } from 'react';
import { Icon, TYPE_ICON, TYPE_LABEL } from './icons';
import { canChange } from '@/lib/engine/answers';
import { LIMITS } from '@/lib/limits';
import type { Answer, Poll, Survey } from '@/lib/types';

/** An answer being filled in, in the shape the server takes. */
export type Draft = { optionIds: string[] } | { value: number } | { order: string[] } | { text: string } | null;

const filled = (poll: Poll, d: Draft): boolean => {
  if (!d) return false;
  if ('optionIds' in d) return d.optionIds.length > 0;
  if ('value' in d) return true;
  if ('order' in d) return d.order.length === ('options' in poll ? poll.options.length : 0);
  return d.text.trim().length > 0;
};

/** The draft a ranking starts from: the options as listed, for the person to reorder. */
const startDraft = (poll: Poll, mine?: Answer): Draft => {
  if (mine && mine.type !== 'quiz' && mine.type !== 'wordcloud' && mine.type !== 'open') return mine as Draft;
  return poll.type === 'ranking' ? { order: poll.options.map((o) => o.id) } : null;
};

export function PollField({ poll, value, onChange, disabled }: { poll: Poll; value: Draft; onChange: (d: Draft) => void; disabled?: boolean }) {
  if (poll.type === 'choice') {
    const picks = value && 'optionIds' in value ? value.optionIds : [];
    const single = poll.maxPicks === 1;
    return (
      <div className="list" role={single ? 'radiogroup' : 'group'}>
        {!single && <span className="small muted">Pick up to {poll.maxPicks}</span>}
        {poll.options.map((o) => {
          const on = picks.includes(o.id);
          const next = single ? [o.id] : on ? picks.filter((x) => x !== o.id) : picks.length < poll.maxPicks ? [...picks, o.id] : picks;
          return (
            <label key={o.id} className={`option ${on ? 'picked' : ''}`}>
              <input type={single ? 'radio' : 'checkbox'} checked={on} disabled={disabled} onChange={() => onChange({ optionIds: next })} />
              <span>{o.label}</span>
            </label>
          );
        })}
      </div>
    );
  }
  if (poll.type === 'rating') {
    const v = value && 'value' in value ? value.value : null;
    return (
      <div className="stack" style={{ gap: 6 }}>
        <div className="scale" role="radiogroup">
          {Array.from({ length: poll.max }, (_, i) => i + 1).map((n) => (
            <button type="button" key={n} role="radio" aria-checked={v === n} className={`num ${v === n ? 'primary' : ''}`} disabled={disabled} onClick={() => onChange({ value: n })}>{n}</button>
          ))}
        </div>
        {(poll.lowLabel || poll.highLabel) && <div className="spread small muted"><span>{poll.lowLabel}</span><span>{poll.highLabel}</span></div>}
      </div>
    );
  }
  if (poll.type === 'ranking') {
    const order = value && 'order' in value ? value.order : poll.options.map((o) => o.id);
    const move = (i: number, by: number) => {
      const next = [...order];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      onChange({ order: next });
    };
    return (
      <div className="list">
        {order.map((id, i) => (
          <div key={id} className="rank-row">
            <span className="num strong">{i + 1}</span>
            <span className="grow">{poll.options.find((o) => o.id === id)?.label}</span>
            <button type="button" className="icon-btn ghost" aria-label="Move up" disabled={disabled || i === 0} onClick={() => move(i, -1)}><Icon name="up" /></button>
            <button type="button" className="icon-btn ghost" aria-label="Move down" disabled={disabled || i === order.length - 1} onClick={() => move(i, 1)}><Icon name="down" /></button>
          </div>
        ))}
      </div>
    );
  }
  const text = value && 'text' in value ? value.text : '';
  return poll.type === 'open'
    ? <textarea rows={3} value={text} maxLength={LIMITS.openChars} disabled={disabled} onChange={(e) => onChange({ text: e.target.value })} aria-label="Your answer" />
    : <input value={text} maxLength={LIMITS.wordChars} disabled={disabled} onChange={(e) => onChange({ text: e.target.value })} aria-label="Your word" />;
}

function PollHeader({ poll, people }: { poll: Poll; people?: number }) {
  return (
    <>
      <div className="poll-label">
        <span><Icon name={TYPE_ICON[poll.type]} />{TYPE_LABEL[poll.type]}</span>
        {!!people && <span className="num"><Icon name="user" />{people}</span>}
      </div>
      <div className="poll-title">{poll.title}</div>
    </>
  );
}

/**
 * One poll on the phone. A choice, rating or ranking can be changed while voting is open; a word
 * cloud or open text takes more entries up to the poll's limit.
 */
export function PollForm({ poll, mine, locked, name, people, onSend }: {
  poll: Poll;
  mine: Answer[];
  locked: boolean;
  name: string;
  people?: number;
  onSend: (answer: unknown) => Promise<string | null>;
}) {
  const changeable = canChange(poll);
  const max = poll.type === 'wordcloud' || poll.type === 'open' ? poll.maxEntries : 1;
  const [draft, setDraft] = useState<Draft>(() => startDraft(poll, mine[0]));
  const [editing, setEditing] = useState(mine.length === 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /* An answer that arrives from the server after the form opened (a reload, another tab) is taken as sent. */
  useEffect(() => {
    if (changeable && mine.length && !busy) {
      setDraft(startDraft(poll, mine[0]));
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.length]);

  const send = async () => {
    setBusy(true);
    setErr(null);
    const e = await onSend(draft);
    setBusy(false);
    if (e) return setErr(e);
    if (changeable) setEditing(false);
    else setDraft(null);
  };

  const sent = changeable ? !editing : mine.length >= max;
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <PollHeader poll={poll} people={people} />
      {changeable ? (
        <PollField poll={poll} value={draft} onChange={setDraft} disabled={busy || locked || !editing} />
      ) : sent ? null : (
        <>
          <PollField poll={poll} value={draft} onChange={setDraft} disabled={busy || locked} />
          {max > 1 && <span className="small muted num">{mine.length} / {max}</span>}
        </>
      )}
      {err && <p className="error small" role="alert">{err}</p>}
      {locked ? (
        <div className="card notice"><span className="dot"><Icon name="lock" /></span>Voting closed</div>
      ) : sent ? (
        <div className="spread">
          <span className="row strong"><Icon name="check" />Sent</span>
          {changeable && <button type="button" onClick={() => setEditing(true)}>Edit response</button>}
        </div>
      ) : (
        <>
          <div className="voting-as">Voting as <b>{name || 'Anonymous'}</b></div>
          <button type="submit" className="primary wide" disabled={busy || !filled(poll, draft)}>Send</button>
        </>
      )}
    </form>
  );
}

/** A survey: every poll on one page, sent with one button. It can be sent again to change the answers that allow it. */
export function SurveyForm({ survey, mine, locked, name, onSend }: {
  survey: Survey;
  mine: Record<string, Answer[]>;
  locked: boolean;
  name: string;
  onSend: (answers: Record<string, unknown>) => Promise<string | null>;
}) {
  const answered = Object.keys(mine).length > 0;
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(survey.polls.map((p) => [p.id, startDraft(p, mine[p.id]?.[0])])));
  const [editing, setEditing] = useState(!answered);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (answered && !busy) setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered]);

  /* A text or word already sent stays as it is; its field shows what was sent. */
  const fixed = (p: Poll) => !canChange(p) && !!mine[p.id]?.length;
  const toSend = Object.fromEntries(survey.polls.filter((p) => !fixed(p) && filled(p, drafts[p.id])).map((p) => [p.id, drafts[p.id]]));

  const send = async () => {
    setBusy(true);
    setErr(null);
    const e = await onSend(toSend);
    setBusy(false);
    if (e) setErr(e);
    else setEditing(false);
  };

  return (
    <form className="stack" style={{ gap: 20 }} onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <div className="poll-label"><span><Icon name="survey" />Survey</span><span className="num">{survey.polls.length} questions</span></div>
      {survey.title && <div className="poll-title">{survey.title}</div>}
      {survey.polls.map((p, i) => {
        const sentText = fixed(p) ? mine[p.id].map((a) => (a.type === 'open' || a.type === 'wordcloud' ? a.text : '')).join(', ') : null;
        return (
          <div key={p.id} className="stack">
            <div className="strong"><span className="num faint">{i + 1}.</span> {p.title}</div>
            {sentText !== null
              ? <div className="reply">{sentText}</div>
              : <PollField poll={p} value={drafts[p.id]} onChange={(d) => setDrafts((cur) => ({ ...cur, [p.id]: d }))} disabled={busy || locked || !editing} />}
          </div>
        );
      })}
      {err && <p className="error small" role="alert">{err}</p>}
      {locked ? (
        <div className="card notice"><span className="dot"><Icon name="lock" /></span>Voting closed</div>
      ) : !editing ? (
        <div className="spread">
          <span className="row strong"><Icon name="check" />Sent</span>
          <button type="button" onClick={() => setEditing(true)}>Edit response</button>
        </div>
      ) : (
        <>
          <div className="voting-as">Voting as <b>{name || 'Anonymous'}</b></div>
          <button type="submit" className="primary wide" disabled={busy || !Object.keys(toSend).length}>Send</button>
        </>
      )}
    </form>
  );
}
