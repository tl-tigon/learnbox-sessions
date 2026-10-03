'use client';
/**
 * The AI debrief of an interaction's results, and the follow-up written from it, as two compact
 * cards under the results on the facilitator's screen. The text comes from the server as plain
 * strings and is rendered as text. Nothing here knows the model's key.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, TYPE_ICON, TYPE_LABEL } from './icons';
import { authed } from '@/lib/auth/client';
import { MODE_LABEL, MODES, type FollowUpMode } from '@/lib/ai/modes';
import type { Interaction } from '@/lib/types';

interface DebriefText { happened: string; explore: string; ask: string[]; tip: string; people: number; at: string }
interface Usage { plan: 'free' | 'pro'; model: string | null; debrief: { used: number; limit: number }; followUp: { used: number; limit: number } }
interface FollowUp { mode: FollowUpMode; interaction: Interaction; note: string }
interface Problem { status: number; text: string }

const WRITING: Record<'debrief' | 'follow-up', string> = { debrief: 'Reading the room...', 'follow-up': 'Thinking of a useful next question...' };

export function AiPanel({ sessionId, interactionId, answered, canFollow, onLaunch }: {
  sessionId: string;
  interactionId: string;
  /** How many have answered: the Debrief button waits for the first. */
  answered: number;
  /** The follow-up is offered while the session runs and has room for one more poll. */
  canFollow: boolean;
  /** Adds the interaction to the session and starts it. */
  onLaunch: (i: Interaction, after: string) => void;
}) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [debrief, setDebrief] = useState<DebriefText | null>(null);
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [mode, setMode] = useState<FollowUpMode | null>(null);
  const [busy, setBusy] = useState<'debrief' | 'follow-up' | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  /* Answers to an earlier interaction's request are dropped if the screen has moved on. */
  const current = useRef(interactionId);
  current.current = interactionId;

  const url = `/api/sessions/${sessionId}/ai`;
  useEffect(() => {
    setDebrief(null);
    setFollowUp(null);
    setMode(null);
    setProblem(null);
    setBusy(null);
    (async () => {
      const r = await authed(`${url}?interaction=${encodeURIComponent(interactionId)}`);
      const j = await r.json().catch(() => ({}));
      if (current.current !== interactionId || !r.ok) return;
      setUsage(j.usage);
      setDebrief(j.debrief);
    })();
  }, [url, interactionId]);

  const ask = useCallback(async (body: Record<string, unknown>) => {
    const feature = body.feature as 'debrief' | 'follow-up';
    const id = interactionId;
    setBusy(feature);
    setProblem(null);
    const r = await authed(url, { method: 'POST', body: JSON.stringify({ ...body, interactionId: id }) });
    const j = await r.json().catch(() => ({}));
    if (current.current !== id) return;
    setBusy(null);
    if (!r.ok) return setProblem({ status: r.status, text: j.error ?? 'LearnBox couldn\'t generate this right now. Try again.' });
    setUsage(j.usage);
    if (feature === 'debrief') {
      setDebrief(j.debrief);
      setFollowUp(null);
    } else setFollowUp(j.followUp);
  }, [url, interactionId]);

  /* Off until the server has a model; on, the card waits for the first answer. */
  if (!usage?.model || (answered === 0 && !debrief)) return null;
  const retry = problem && problem.status !== 402 && problem.status !== 409 && problem.status !== 429;

  const message = problem && (
    <p className={problem.status === 402 || problem.status === 409 ? 'small muted' : 'small error'} role={problem.status === 402 || problem.status === 409 ? 'status' : 'alert'}>
      {problem.text}{problem.status === 402 && <> <a href="/app/account">Get Pro</a></>}
    </p>
  );

  if (!debrief) {
    return (
      <div className="ai stack">
        {busy === 'debrief'
          ? <span className="row muted"><Icon name="spark" />{WRITING.debrief}</span>
          : <div><button className="tint-accent tall" onClick={() => ask({ feature: 'debrief' })}><Icon name="spark" />Debrief</button></div>}
        {message}
      </div>
    );
  }

  return (
    <div className="ai stack">
      <section className="ai-card stack" aria-label="LearnBox Debrief">
        <div className="ai-head"><span className="row"><Icon name="spark" />LearnBox Debrief</span><span className="small muted num">{debrief.people} answered</span></div>
        <Part label="What happened" text={debrief.happened} />
        <Part label="What to explore" text={debrief.explore} />
        <div className="ai-part"><h4>Ask the room</h4>{debrief.ask.map((q, n) => <p key={n}>“{q}”</p>)}</div>
        <Part label="Facilitator tip" text={debrief.tip} />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {busy === 'debrief'
            ? <span className="row muted"><Icon name="spark" />{WRITING.debrief}</span>
            : <button className="small" disabled={!!busy} onClick={() => ask({ feature: 'debrief', again: true })}><Icon name="restore" />Generate another</button>}
          <span className="grow" />
          <span className="tag num">{usage.debrief.used} / {usage.debrief.limit} this month</span>
        </div>
        {busy !== 'follow-up' && message}
      </section>

      {canFollow && (
        <section className="ai-card stack" aria-label="Follow up with the room">
          <div className="ai-head"><span className="row"><Icon name="right" />Follow up with the room</span><span className="tag num">{usage.followUp.used} / {usage.followUp.limit} this month</span></div>
          <div className="chips" role="group" aria-label="Follow-up mode">
            {MODES.map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} disabled={!!busy} onClick={() => { setMode(m); void ask({ feature: 'follow-up', mode: m }); }}>{MODE_LABEL[m]}</button>
            ))}
          </div>
          {busy === 'follow-up' && <span className="row muted"><Icon name="spark" />{WRITING['follow-up']}</span>}
          {busy === 'follow-up' ? null : message}
          {followUp && busy !== 'follow-up' && <Proposal f={followUp} busy={!!busy} onAgain={() => ask({ feature: 'follow-up', mode: followUp.mode })} onLaunch={() => onLaunch(followUp.interaction, interactionId)} />}
        </section>
      )}
    </div>
  );
}

function Part({ label, text }: { label: string; text: string }) {
  return <div className="ai-part"><h4>{label}</h4><p>{text}</p></div>;
}

/** The interaction the model proposed, as it would look, with the one button that puts it in front of the room. */
function Proposal({ f, busy, onAgain, onLaunch }: { f: FollowUp; busy: boolean; onAgain: () => void; onLaunch: () => void }) {
  const i = f.interaction;
  const options = i.type === 'quiz' ? i.questions[0].options : 'options' in i ? i.options : [];
  const correct = i.type === 'quiz' ? i.questions[0].correctId : null;
  return (
    <div className="sub">
      <span className="row small muted"><Icon name={TYPE_ICON[i.type]} />{TYPE_LABEL[i.type]} · {MODE_LABEL[f.mode]}</span>
      <div className="strong">{i.title}</div>
      {options.length > 0 && (
        <ul className="ticks">
          {options.map((o) => <li key={o.id}>{o.id === correct ? <Icon name="check" /> : <span style={{ width: 16, flex: 'none' }} />}<span>{o.label}</span></li>)}
        </ul>
      )}
      {i.type === 'rating' && <span className="small muted">Scale 1 to {i.max}</span>}
      {f.note && <p className="small muted">{f.note}</p>}
      <div className="row" style={{ gap: 8 }}>
        <button className="primary tall" disabled={busy} onClick={onLaunch}><Icon name="play" />Launch this interaction</button>
        <button className="ghost tall" disabled={busy} onClick={onAgain}>Another</button>
      </div>
    </div>
  );
}
