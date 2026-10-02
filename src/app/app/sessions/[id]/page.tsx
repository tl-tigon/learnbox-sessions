'use client';
/**
 * The facilitator's screen for one session. On the left, the polls, quizzes and surveys, each
 * with a button to start it. On the right, the Q&A to moderate, or the selected interaction to
 * edit and run. Edits save as they are typed.
 */
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PollEditor, QuizEditor, SurveyEditor } from '@/components/editor';
import { Icon, TYPE_ICON, TYPE_LABEL } from '@/components/icons';
import { QaHost } from '@/components/qa';
import { Leaderboard, secondsLeft, useServerClock } from '@/components/quiz';
import { PollResults, QuizResults } from '@/components/results';
import { useSignedIn } from '@/components/use-signed-in';
import { authed } from '@/lib/auth/client';
import { blankInteraction, INTERACTION_TYPES } from '@/lib/engine/polls';
import { quizPhase } from '@/lib/engine/quiz';
import { LIMITS } from '@/lib/limits';
import { useHost, withQuestion, type HostView } from '@/lib/use-host';
import type { Interaction, InteractionType, QaSettings, Quiz } from '@/lib/types';

interface Draft { title: string; interactions: Interaction[]; qa: QaSettings }

export default function HostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const email = useSignedIn();
  if (!email) return null;
  return <Host id={id} />;
}

const nameOf = (i: Interaction) => i.title || 'Untitled';

function Host({ id }: { id: string }) {
  const router = useRouter();
  const { data: v, setData, error, refresh } = useHost(id);
  const now = useServerClock(v?.serverNow);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  /* What the facilitator edits is kept here and saved shortly after each change. It is loaded
     once: this screen is where it changes, so the server is not asked to overwrite it. */
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error'>('saved');
  const draftRef = useRef<Draft | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (v && !draftRef.current) {
      draftRef.current = { title: v.title, interactions: v.interactions, qa: v.qa };
      setDraft(draftRef.current);
    }
  }, [v]);

  /** Saves now if there is anything unsaved. Controls call it first, so they act on what is on screen. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current || !draftRef.current) return true;
    dirty.current = false;
    setSaved('saving');
    const r = await authed(`/api/sessions/${id}`, { method: 'PUT', body: JSON.stringify(draftRef.current) }).catch(() => null);
    if (!r?.ok) {
      dirty.current = true;
      setSaved('error');
      return false;
    }
    const j = await r.json();
    setData((cur) => (cur ? { ...cur, title: j.title, interactions: j.interactions, qa: j.qa, state: j.state.seq > cur.state.seq ? j.state : cur.state } : cur));
    if (!dirty.current) setSaved('saved');
    return true;
  }, [id, setData]);

  const edit = useCallback((fn: (d: Draft) => Draft) => {
    if (!draftRef.current) return;
    draftRef.current = fn(draftRef.current);
    setDraft(draftRef.current);
    dirty.current = true;
    setSaved('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  }, [flush]);
  const editInteraction = (next: Interaction) => edit((d) => ({ ...d, interactions: d.interactions.map((i) => (i.id === next.id ? next : i)) }));

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    if (!(await flush())) {
      setBusy(false);
      return setErr('Not saved');
    }
    const r = await authed(`/api/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? 'Not applied');
    if (j.state) setData((cur) => (cur && j.state.seq > cur.state.seq ? { ...cur, state: j.state } : cur));
    await refresh();
  };

  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'qa' | 'item'>('qa');
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  if (!v || !draft) return <main className="narrow"><p className={error ? 'error' : 'muted'}>{error ?? 'Loading…'}</p></main>;

  const ended = v.status === 'ended';
  const item = draft.interactions.find((i) => i.id === selected) ?? null;
  const select = (itemId: string) => {
    setSelected(itemId);
    setTab('item');
  };
  const add = (type: InteractionType) => {
    const made = blankInteraction(type);
    edit((d) => ({ ...d, interactions: [...d.interactions, made] }));
    setAdding(false);
    select(made.id);
  };
  const remove = (target: Interaction) => {
    if (!confirm(`Delete "${nameOf(target)}"? Its answers are removed from the results.`)) return;
    edit((d) => ({ ...d, interactions: d.interactions.filter((i) => i.id !== target.id) }));
    setTab('qa');
  };
  const reorder = (index: number, by: number) => edit((d) => {
    const next = [...d.interactions];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    return { ...d, interactions: next };
  });

  const projector = `${origin}/present/${id}#k=${v.displayKey}`;
  const pendingCount = v.questions.filter((q) => q.status === 'pending').length;

  return (
    <>
      <header className="topbar">
        <a className="btn icon-btn ghost" href="/app" aria-label="All sessions"><Icon name="left" /></a>
        <input className="title-input grow" aria-label="Session name" value={draft.title} maxLength={LIMITS.titleChars} disabled={ended}
          onChange={(e) => edit((d) => ({ ...d, title: e.target.value }))} />
        <span className="code-pill num" title="Join code"># {v.code.slice(0, 3)} {v.code.slice(3)}</span>
        <span className="row muted num" title="People joined"><Icon name="user" />{v.people}</span>
        {ended ? <span className="tag">Ended</span> : <span className="tag" role="status">{saved === 'saving' ? 'Saving…' : saved === 'error' ? 'Not saved' : 'Saved'}</span>}
        <a className="btn" href={`/app/sessions/${id}/results`}>Results</a>
        {!ended && <a className="btn primary" href={`/present/${id}`} target="_blank" rel="noreferrer"><Icon name="screen" />Present</a>}
        <div className="menu">
          <button className="icon-btn" aria-label="More" aria-expanded={menu} onClick={() => setMenu((x) => !x)}><Icon name="more" /></button>
          {menu && (
            <div className="items" onClick={() => setMenu(false)}>
              {!ended && <button onClick={() => navigator.clipboard?.writeText(`${origin}/s/${v.code}`)}><Icon name="copy" />Copy join link</button>}
              {!ended && <button onClick={() => navigator.clipboard?.writeText(projector)}><Icon name="screen" />Copy projector link</button>}
              <button onClick={async () => {
                await flush();
                const r = await authed('/api/sessions', { method: 'POST', body: JSON.stringify({ from: id }) });
                const j = await r.json().catch(() => ({}));
                if (r.ok) router.push(`/app/sessions/${j.session.id}`);
                else setErr(j.error ?? 'Not copied');
              }}><Icon name="copy" />Duplicate session</button>
              {!ended && (
                <button className="danger" onClick={async () => {
                  if (!confirm('End this session? People can no longer answer or ask.')) return;
                  await act({ action: 'end' });
                }}><Icon name="stop" />End session</button>
              )}
              <button className="danger" onClick={async () => {
                if (!confirm(`Delete "${draft.title}"? Its results are deleted with it.`)) return;
                const r = await authed(`/api/sessions/${id}`, { method: 'DELETE' });
                if (r.ok) router.push('/app');
              }}><Icon name="trash" />Delete session</button>
            </div>
          )}
        </div>
      </header>

      <div className="host">
        <section className="stack" aria-label="Polls">
          <div className="spread">
            <h2>Polls <span className="count num">{draft.interactions.length}</span></h2>
            {!ended && draft.interactions.length < LIMITS.interactionsPerSession && (
              <div className="menu">
                <button className="primary" aria-expanded={adding} onClick={() => setAdding((x) => !x)}><Icon name="plus" />Add</button>
                {adding && (
                  <div className="items">
                    {INTERACTION_TYPES.map((t) => <button key={t} onClick={() => add(t)}><Icon name={TYPE_ICON[t]} />{TYPE_LABEL[t]}</button>)}
                  </div>
                )}
              </div>
            )}
          </div>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="list">
            {draft.interactions.map((i, index) => {
              const active = v.state.active === i.id;
              const answered = i.type === 'quiz' ? Math.max(0, ...i.questions.map((q) => v.answered[q.id] ?? 0)) : i.type === 'survey' ? Math.max(0, ...i.polls.map((p) => v.answered[p.id] ?? 0)) : v.answered[i.id] ?? 0;
              return (
                <div key={i.id} className="field-row">
                  <button className={`item grow ${selected === i.id && tab === 'item' ? 'selected' : ''} ${active ? 'active' : ''}`} onClick={() => select(i.id)}>
                    <span className="kind"><Icon name={TYPE_ICON[i.type]} /></span>
                    <span className="grow stack" style={{ gap: 0 }}>
                      <span className="truncate" style={{ display: 'block', maxWidth: 190 }}>{nameOf(i)}</span>
                      <span className="tag">{active ? <span className="live-dot">Live</span> : TYPE_LABEL[i.type]} · <span className="num">{answered}</span> answered</span>
                    </span>
                  </button>
                  {!ended && (active
                    ? <button className="icon-btn" aria-label={`Stop ${nameOf(i)}`} disabled={busy} onClick={() => act({ action: 'activate', id: null })}><Icon name="stop" /></button>
                    : <button className="icon-btn" aria-label={`Start ${nameOf(i)}`} disabled={busy} onClick={() => { select(i.id); void act({ action: 'activate', id: i.id }); }}><Icon name="play" /></button>)}
                  {!ended && (
                    <span className="stack" style={{ gap: 0 }}>
                      <button className="icon-btn ghost" style={{ minHeight: 26, height: 26 }} aria-label={`Move ${nameOf(i)} up`} disabled={index === 0} onClick={() => reorder(index, -1)}><Icon name="up" /></button>
                      <button className="icon-btn ghost" style={{ minHeight: 26, height: 26 }} aria-label={`Move ${nameOf(i)} down`} disabled={index === draft.interactions.length - 1} onClick={() => reorder(index, 1)}><Icon name="down" /></button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="stack">
          <div className="subtabs" role="tablist">
            <button role="tab" aria-selected={tab === 'qa'} onClick={() => setTab('qa')}><Icon name="chat" />Q&A{pendingCount > 0 && <span className="count num">{pendingCount} to review</span>}</button>
            {item && <button role="tab" aria-selected={tab === 'item'} onClick={() => setTab('item')}><Icon name={TYPE_ICON[item.type]} />{nameOf(item)}</button>}
          </div>

          {(tab === 'qa' || !item) && (
            <div className="stack">
              {!ended && (
                <div className="card stack">
                  <label className="switch">Questions open
                    {/* The switch moves at once; if the change is refused, the reload puts it back. */}
                    <input type="checkbox" checked={v.state.qaOpen} disabled={busy} onChange={(e) => {
                      const on = e.target.checked;
                      setData((cur) => (cur ? { ...cur, state: { ...cur.state, qaOpen: on } } : cur));
                      void act({ action: 'qa-open', on });
                    }} />
                  </label>
                  <label className="switch">Review questions before they show<input type="checkbox" checked={draft.qa.moderation} onChange={(e) => edit((d) => ({ ...d, qa: { ...d.qa, moderation: e.target.checked } }))} /></label>
                  <label className="switch">Anonymous questions<input type="checkbox" checked={draft.qa.anonymous} onChange={(e) => edit((d) => ({ ...d, qa: { ...d.qa, anonymous: e.target.checked } }))} /></label>
                  <form className="field-row" onSubmit={(e) => { e.preventDefault(); void act({ action: 'announce', text: announcement ?? v.state.announcement }).then(() => setAnnouncement(null)); }}>
                    <input aria-label="Announcement" placeholder="Announcement" maxLength={LIMITS.announcementChars} value={announcement ?? v.state.announcement} onChange={(e) => setAnnouncement(e.target.value)} />
                    <button type="submit" disabled={busy || announcement === null || announcement === v.state.announcement}>Post</button>
                  </form>
                </div>
              )}
              <QaHost sessionId={id} questions={v.questions} state={v.state} moderation={draft.qa.moderation} ended={ended}
                onChange={(q, state) => setData((cur) => (cur ? { ...cur, questions: withQuestion(cur.questions, q), state: state.seq > cur.state.seq ? state : cur.state } : cur))} />
            </div>
          )}

          {tab === 'item' && item && (
            <ItemPanel v={v} item={item} now={now} busy={busy} ended={ended} act={act} onChange={editInteraction} onDelete={() => remove(item)} />
          )}
        </section>
      </div>
    </>
  );
}

/** The selected interaction: its controls while it runs, its results, and its fields. */
function ItemPanel({ v, item, now, busy, ended, act, onChange, onDelete }: {
  v: HostView;
  item: Interaction;
  now: number;
  busy: boolean;
  ended: boolean;
  act: (body: Record<string, unknown>) => Promise<void>;
  onChange: (i: Interaction) => void;
  onDelete: () => void;
}) {
  const active = v.state.active === item.id;
  const q = item.type === 'quiz' && v.state.quiz?.quizId === item.id ? v.state.quiz : null;
  /* A quiz that has started keeps its questions, so its fields are read-only from then on. */
  const started = item.type === 'quiz' && (!!v.state.played?.includes(item.id) || (!!q && q.index >= 0));

  return (
    <div className="stack">
      <div className="card stack">
        <div className="spread">
          <span className="row muted"><Icon name={TYPE_ICON[item.type]} />{TYPE_LABEL[item.type]}{active && <span className="live-dot">Live</span>}</span>
          <div className="row">
            {!ended && (active
              ? <button disabled={busy} onClick={() => act({ action: 'activate', id: null })}><Icon name="stop" />Stop</button>
              : <button className="primary" disabled={busy} onClick={() => act({ action: 'activate', id: item.id })}><Icon name="play" />Start</button>)}
            {!ended && <button className="icon-btn danger" aria-label="Delete" onClick={onDelete}><Icon name="trash" /></button>}
          </div>
        </div>

        {active && item.type !== 'quiz' && (
          <div className="row">
            <button className={v.state.locked ? 'on' : ''} aria-pressed={v.state.locked} disabled={busy} onClick={() => act({ action: 'lock', on: !v.state.locked })}>
              <Icon name={v.state.locked ? 'lock' : 'unlock'} />{v.state.locked ? 'Voting locked' : 'Lock voting'}
            </button>
            {item.type !== 'survey' && (
              <button className={v.state.showResults ? '' : 'on'} aria-pressed={!v.state.showResults} disabled={busy} onClick={() => act({ action: 'results', on: !v.state.showResults })}>
                <Icon name={v.state.showResults ? 'eye' : 'eyeoff'} />{v.state.showResults ? 'Results shown' : 'Results hidden'}
              </button>
            )}
          </div>
        )}

        {active && item.type === 'quiz' && q && <QuizControls quiz={item} v={v} now={now} busy={busy} act={act} />}

        {active && item.type !== 'quiz' && item.type !== 'survey' && (
          <>
            <span className="muted num">{v.tally?.people ?? 0} answered</span>
            <PollResults poll={item} tally={v.tally} texts={v.texts} />
          </>
        )}
        {active && item.type === 'survey' && (
          <div className="list">
            {item.polls.map((p, i) => <div key={p.id} className="spread"><span className="truncate"><span className="num faint">{i + 1}.</span> {p.title || 'Untitled'}</span><span className="muted num">{v.answered[p.id] ?? 0} answered</span></div>)}
          </div>
        )}
      </div>

      <div className="card">
        {item.type === 'quiz' ? <QuizEditor quiz={item} onChange={onChange} disabled={ended || started} />
          : item.type === 'survey' ? <SurveyEditor survey={item} onChange={onChange} disabled={ended} />
          : <PollEditor poll={item} onChange={onChange} disabled={ended} />}
      </div>
    </div>
  );
}

/** The quiz's one next step, by where it is: start, reveal, leaderboard or the next question. */
function QuizControls({ quiz, v, now, busy, act }: { quiz: Quiz; v: HostView; now: number; busy: boolean; act: (body: Record<string, unknown>) => Promise<void> }) {
  const q = v.state.quiz!;
  const phase = quizPhase(q, now);
  const question = quiz.questions[q.index];
  const last = q.index >= quiz.questions.length - 1;
  const next = <button className="primary" disabled={busy} onClick={() => act({ action: 'quiz-next' })}>Next question</button>;
  return (
    <div className="stack">
      <div className="row">
        {phase === 'lobby' && <><button className="primary" disabled={busy} onClick={() => act({ action: 'quiz-next' })}>Start quiz</button><span className="muted num">{v.people} joined</span></>}
        {(phase === 'open' || phase === 'closed') && (
          <>
            <button className="primary" disabled={busy} onClick={() => act({ action: 'quiz-reveal' })}>Reveal answer</button>
            <span className="num strong" aria-label="Seconds left">{secondsLeft(q, now)} s</span>
          </>
        )}
        {phase === 'revealed' && (
          <>
            {!last && next}
            <button className={last ? 'primary' : ''} disabled={busy} onClick={() => act({ action: 'quiz-board', on: true })}>Leaderboard</button>
          </>
        )}
        {phase === 'board' && !last && next}
        {phase !== 'lobby' && <span className="muted num">{q.index + 1} / {quiz.questions.length} · {v.tally?.people ?? 0} answered</span>}
      </div>
      {phase === 'board'
        ? v.board && <Leaderboard entries={v.board.entries} />
        : question && phase !== 'lobby' && (
          <>
            <div className="poll-title">{question.title}</div>
            <QuizResults question={question} tally={v.tally} spread={phase !== 'open'} correct={question.correctId} />
          </>
        )}
    </div>
  );
}
