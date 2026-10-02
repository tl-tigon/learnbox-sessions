'use client';
/**
 * The facilitator's screen for one session, laid out as Slido's host screen is: a header with the
 * name, the code, Share and Present; a list of cards on the left (the Q&A, then each poll, quiz
 * and survey); the open card on the right, with a bar under it that starts and stops it.
 * Settings and replies open in a panel down the right side. Edits save as they are typed.
 */
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Confirm, Panel, Toast, type Ask } from '@/components/dialog';
import { hasSettings, PollEditor, PollSettings, QuizEditor, SurveyEditor } from '@/components/editor';
import { Icon, TYPE_ICON, TYPE_LABEL } from '@/components/icons';
import { Menu } from '@/components/menu';
import { QaHost } from '@/components/qa';
import { Leaderboard, secondsLeft, useServerClock } from '@/components/quiz';
import { QuizResults } from '@/components/results';
import { useSignedIn } from '@/components/use-signed-in';
import { authed } from '@/lib/auth/client';
import { blankInteraction, INTERACTION_TYPES, withNewIds } from '@/lib/engine/polls';
import { quizPhase } from '@/lib/engine/quiz';
import { LIMITS, PLANS } from '@/lib/limits';
import { useHost, withQuestion, type HostView } from '@/lib/use-host';
import type { Interaction, InteractionType, QaSettings, Quiz, Tally } from '@/lib/types';

interface Draft { title: string; interactions: Interaction[]; qa: QaSettings }
type Act = (body: Record<string, unknown>) => Promise<boolean>;

export default function HostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const email = useSignedIn();
  if (!email) return null;
  return <Host id={id} />;
}

const nameOf = (i: Interaction) => i.title || 'Untitled';
const EMPTY: Tally = { people: 0, counts: {} };
const START: Record<InteractionType, string> = { choice: 'Start poll', wordcloud: 'Start poll', rating: 'Start poll', open: 'Start poll', ranking: 'Start poll', quiz: 'Start quiz', survey: 'Start survey' };

function Host({ id }: { id: string }) {
  const router = useRouter();
  /* What the right side shows: the Q&A, the selected interaction, or the types to add. */
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'qa' | 'item' | 'add'>('qa');
  const { data: v, setData, error, refresh } = useHost(id, view === 'item' ? selected : null);
  const now = useServerClock(v?.serverNow);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  /* Opening an interaction fetches its stored results at once. */
  useEffect(() => {
    if (view === 'item' && selected) void refresh();
  }, [view, selected, refresh]);

  /* What the facilitator edits is kept here and saved shortly after each change. It is loaded
     once: this screen is where it changes, so the server is not asked to overwrite it. */
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error' | 'conflict'>('saved');
  const draftRef = useRef<Draft | null>(null);
  /* The revision the draft was made from. The server refuses a save made from an older one, so a
     second window open on the same session cannot silently overwrite this one. */
  const rev = useRef(1);
  const dirty = useRef(false);
  const conflict = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    if (v && !draftRef.current) {
      draftRef.current = { title: v.title, interactions: v.interactions, qa: v.qa };
      rev.current = v.rev;
      setDraft(draftRef.current);
      /* A session with nothing in it yet opens on the types to add. */
      if (v.interactions.length === 0 && v.status === 'live') setView('add');
    }
  }, [v]);

  /**
   * Saves now if there is anything unsaved, and waits for a save already on its way. Saves run
   * one at a time, so an older one can never land after a newer one. Controls call this first,
   * so they act on what is on screen. `leaving` marks the last save as the page closes.
   */
  const flushRef = useRef<(leaving?: boolean) => Promise<boolean>>(async () => true);
  const flush = useCallback(async (leaving = false): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    for (;;) {
      if (inFlight.current) {
        if (!(await inFlight.current)) return false;
        continue;
      }
      if (conflict.current) return false;
      if (!dirty.current || !draftRef.current) return true;
      dirty.current = false;
      setSaved('saving');
      const body = JSON.stringify({ ...draftRef.current, rev: rev.current });
      inFlight.current = (async () => {
        /* A request marked keepalive outlives the page, and may carry up to 64 KB. */
        const r = await authed(`/api/sessions/${id}`, { method: 'PUT', body, keepalive: leaving && body.length < 60_000 });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          dirty.current = true;
          if (r.status === 409 && /another window/.test(j.error ?? '')) {
            conflict.current = true;
            setSaved('conflict');
          } else {
            setSaved('error');
            /* A save that failed is tried again by itself, so the last edit before a pause is not lost. */
            timer.current = setTimeout(() => void flushRef.current(), 4000);
          }
          return false;
        }
        rev.current = j.rev;
        setData((cur) => (cur ? { ...cur, title: j.title, interactions: j.interactions, qa: j.qa, rev: j.rev, state: j.state.seq > cur.state.seq ? j.state : cur.state } : cur));
        if (!dirty.current) setSaved('saved');
        return true;
      })().finally(() => {
        inFlight.current = null;
      });
    }
  }, [id, setData]);
  flushRef.current = flush;

  /* Closing the tab, switching away or leaving this screen saves what is unsaved. */
  useEffect(() => {
    const leave = () => void flushRef.current(true);
    const hide = () => {
      if (document.visibilityState === 'hidden') leave();
    };
    window.addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', hide);
      leave();
    };
  }, []);

  const edit = useCallback((fn: (d: Draft) => Draft) => {
    if (!draftRef.current || conflict.current) return;
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
  /** A control. It saves first, and says whether it was applied. */
  const act: Act = async (body) => {
    setBusy(true);
    setErr(null);
    if (!(await flush())) {
      setBusy(false);
      setErr(conflict.current ? 'Reload to carry on' : 'Not saved');
      return false;
    }
    const r = await authed(`/api/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(j.error ?? 'Not applied');
      return false;
    }
    if (j.state) setData((cur) => (cur && j.state.seq > cur.state.seq ? { ...cur, state: j.state } : cur));
    await refresh();
    return true;
  };
  /** Follows a link once what is unsaved has been saved. */
  const leaveTo = (href: string) => async (e: React.MouseEvent) => {
    e.preventDefault();
    await flush();
    router.push(href);
  };

  /* When a quiz question's time runs out, this screen fetches how people voted. */
  const playing = v?.state.quiz && v.state.active === v.state.quiz.quizId ? v.state.quiz : null;
  const phaseNow = playing ? quizPhase(playing, now) : null;
  const lastPhase = useRef(phaseNow);
  useEffect(() => {
    if (lastPhase.current === 'open' && phaseNow === 'closed') void refresh();
    lastPhase.current = phaseNow;
  }, [phaseNow, refresh]);

  /* What is open at the side: the session's settings, the Q&A's, or the open poll's. */
  const [panel, setPanel] = useState<'session' | 'qa' | 'poll' | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Ask | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const copy = (what: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setToast(`${what} copied`);
  };

  if (!v || !draft) return <main className="narrow"><p className={error ? 'error' : 'muted'}>{error ?? 'Loading…'}</p></main>;

  const ended = v.status === 'ended';
  const item = draft.interactions.find((i) => i.id === selected) ?? null;
  /* An interaction that has been deleted leaves the Q&A in its place. */
  const showing = view === 'item' && !item ? 'qa' : view;
  const plan = PLANS[v.plan];
  const room = draft.interactions.length < plan.interactionsPerSession;
  const full = v.people >= plan.peoplePerSession;
  const select = (itemId: string) => {
    setSelected(itemId);
    setView('item');
  };
  const add = (type: InteractionType) => {
    const made = blankInteraction(type);
    edit((d) => ({ ...d, interactions: [...d.interactions, made] }));
    select(made.id);
  };
  const duplicate = (target: Interaction) => {
    const [made] = withNewIds([target]);
    edit((d) => {
      const at = d.interactions.findIndex((i) => i.id === target.id);
      return { ...d, interactions: [...d.interactions.slice(0, at + 1), made, ...d.interactions.slice(at + 1)] };
    });
    select(made.id);
  };
  const remove = (target: Interaction) => setConfirm({
    title: `Delete "${nameOf(target)}"`,
    text: 'Its answers are removed from the results.',
    action: 'Delete',
    danger: true,
    run: () => {
      edit((d) => ({ ...d, interactions: d.interactions.filter((i) => i.id !== target.id) }));
      if (selected === target.id) setView('qa');
    },
  });
  const reorder = (index: number, by: number) => edit((d) => {
    const next = [...d.interactions];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    return { ...d, interactions: next };
  });
  const start = (i: Interaction) => {
    select(i.id);
    void act({ action: 'activate', id: i.id });
  };
  const stop = () => act({ action: 'activate', id: null });
  const answeredOf = (i: Interaction) => (i.type === 'quiz' ? Math.max(0, ...i.questions.map((q) => v.answered[q.id] ?? 0)) : i.type === 'survey' ? Math.max(0, ...i.polls.map((p) => v.answered[p.id] ?? 0)) : v.answered[i.id] ?? 0);

  const joinLink = `${origin}/s/${v.code}`;
  const projector = `${origin}/present/${id}#k=${v.displayKey}`;
  const resultsHref = `/app/sessions/${id}/results`;
  const pendingCount = v.questions.filter((q) => q.status === 'pending').length;
  const itemActive = !!item && v.state.active === item.id;
  const itemIndex = item ? draft.interactions.findIndex((i) => i.id === item.id) : -1;
  /* The interaction before or after the open one; Prev and Next start it in place of the running one. */
  const neighbour = (by: number) => draft.interactions[itemIndex + by] ?? null;
  const settingsPoll = item && item.type !== 'quiz' && item.type !== 'survey' && hasSettings(item) ? item : null;
  const qaSwitches = (
    <>
      <div className="setting">
        <label className="switch strong">Review questions<input type="checkbox" checked={draft.qa.moderation} disabled={ended} onChange={(e) => edit((d) => ({ ...d, qa: { ...d.qa, moderation: e.target.checked } }))} /></label>
        <p className="muted">A question shows to the audience once you approve it.</p>
      </div>
      <div className="setting">
        <label className="switch strong">Anonymous questions<input type="checkbox" checked={draft.qa.anonymous} disabled={ended} onChange={(e) => edit((d) => ({ ...d, qa: { ...d.qa, anonymous: e.target.checked } }))} /></label>
        <p className="muted">People can ask without giving a name.</p>
      </div>
    </>
  );

  return (
    <div className="hostpage">
      <header className="hosthead">
        <a className="btn round" href="/app" aria-label="All sessions" onClick={leaveTo('/app')}><Icon name="left" /></a>
        <input className="title-input" aria-label="Session name" value={draft.title} maxLength={LIMITS.titleChars} disabled={ended}
          style={{ width: `${Math.max(10, draft.title.length + 2)}ch` }}
          onChange={(e) => edit((d) => ({ ...d, title: e.target.value }))} />
        {ended ? <span className="tag">Ended</span>
          : saved === 'conflict' ? <button className="danger" onClick={() => window.location.reload()}>Changed in another window · Reload</button>
          : <span className={saved === 'error' ? 'tag error' : 'tag'} role="status">{saved === 'saving' ? 'Saving…' : saved === 'error' ? 'Not saved' : 'Saved'}</span>}
        <span className="grow gap" />
        <span className="row muted num" title="People joined"><Icon name="user" />{v.people}</span>
        {full && !ended && (v.plan === 'free'
          ? <a className="pill-danger" href="/app/account" title={`Free holds ${plan.peoplePerSession} people in a session`} onClick={leaveTo('/app/account')}>Full · Get Pro</a>
          : <span className="pill-danger">Full</span>)}
        <button className="ghost code num" aria-label={`Copy join code ${v.code}`} title="Copy join code" onClick={() => copy('Code', v.code)}># {v.code.slice(0, 3)} {v.code.slice(3)}</button>
        {!ended && (
          <Menu label="Share" className="outline" trigger={<><Icon name="share" /><span className="wide-only">Share</span></>}>
            <button onClick={() => copy('Join link', joinLink)}><Icon name="copy" />Copy join link</button>
            <button onClick={() => copy('Projector link', projector)}><Icon name="screen" />Copy projector link</button>
          </Menu>
        )}
        <div className={ended ? '' : 'split'}>
          {!ended && <a className="btn primary tall" href={`/present/${id}`} target="_blank" rel="noreferrer" aria-label="Present"><Icon name="screen" /><span className="wide-only">Present</span></a>}
          <Menu label="More" className={ended ? 'outline icon-btn' : 'primary tall icon-btn'} trigger={<Icon name="more" size={20} />}>
            <a className="btn only-narrow" href={resultsHref} onClick={leaveTo(resultsHref)}><Icon name="trend" />Results</a>
            <button className="only-narrow" onClick={() => setPanel('session')}><Icon name="sliders" />Settings</button>
            <button onClick={async () => {
              await flush();
              const r = await authed('/api/sessions', { method: 'POST', body: JSON.stringify({ from: id }) });
              const j = await r.json().catch(() => ({}));
              if (r.ok) router.push(`/app/sessions/${j.session.id}`);
              else setErr(j.error ?? 'Not copied');
            }}><Icon name="copy" />Duplicate session</button>
            {!ended && (
              <button className="danger" onClick={() => setConfirm({ title: 'End session', text: 'People can no longer answer or ask. The results stay.', action: 'End session', danger: true, run: () => void act({ action: 'end' }) })}><Icon name="stop" />End session</button>
            )}
            <button className="danger" onClick={() => setConfirm({
              title: `Delete "${draft.title}"`,
              text: 'Its results are deleted with it.',
              action: 'Delete session',
              danger: true,
              run: async () => {
                const r = await authed(`/api/sessions/${id}`, { method: 'DELETE' });
                if (r.ok) router.push('/app');
                else setErr('Not deleted');
              },
            })}><Icon name="trash" />Delete session</button>
          </Menu>
        </div>
      </header>

      <nav className="rail" aria-label="Session">
        <button className="on" aria-label="Interactions" aria-current="page" title="Interactions"><Icon name="list" size={18} /></button>
        <a className="btn" href={resultsHref} aria-label="Results" title="Results" onClick={leaveTo(resultsHref)}><Icon name="trend" size={18} /></a>
        <button aria-label="Settings" title="Settings" onClick={() => setPanel('session')}><Icon name="sliders" size={18} /></button>
      </nav>

      <div className="hostmain">
        <section className="hostlist" aria-label="Polls">
          <h2>Interactions</h2>
          {!ended && room && <div><button className="primary tall" onClick={() => setView('add')}><Icon name="plus" />Add</button></div>}
          {!ended && !room && v.plan === 'free' && <div><a className="btn tall" href="/app/account" onClick={leaveTo('/app/account')}>Get Pro · {PLANS.pro.interactionsPerSession} polls</a></div>}

          <h3>Q&A</h3>
          <div className={`icard qa ${showing === 'qa' ? 'selected' : ''}`} onClick={() => setView('qa')}>
            <span className="kind"><Icon name="chat" size={24} /></span>
            <button type="button" className="title">
              <span className="small muted num">{v.questions.length === 1 ? '1 question' : `${v.questions.length} questions`}{pendingCount > 0 && <> · <span className="warn">{pendingCount} to review</span></>}</span>
              {!ended && <span className={`status ${v.state.qaOpen ? '' : 'closed'}`}>{v.state.qaOpen ? 'Open' : 'Closed'}</span>}
            </button>
          </div>

          <h3>Polls <span className="count num">{draft.interactions.length} / {plan.interactionsPerSession}</span></h3>
          {draft.interactions.map((i, index) => {
            const active = v.state.active === i.id;
            const name = nameOf(i);
            return (
              <div key={i.id} className={`icard ${showing === 'item' && selected === i.id ? 'selected' : ''} ${active ? 'active' : ''}`} onClick={() => select(i.id)}>
                <button type="button" className="title"><span>{name}</span></button>
                <div className="meta">
                  <span className="kind" title={TYPE_LABEL[i.type]}><Icon name={TYPE_ICON[i.type]} size={20} /></span>
                  <span className={`small num grow ${active ? 'live-dot' : 'muted'}`}>{answeredOf(i)} answered</span>
                  {!ended && (
                    <div className="acts" onClick={(e) => e.stopPropagation()}>
                      {active && i.type !== 'quiz' && i.type !== 'survey' && (
                        <button className="icon-btn ghost sm" aria-label={v.state.showResults ? 'Hide results' : 'Show results'} title={v.state.showResults ? 'Hide results' : 'Show results'} aria-pressed={!v.state.showResults} disabled={busy}
                          onClick={() => act({ action: 'results', on: !v.state.showResults })}><Icon name={v.state.showResults ? 'eye' : 'eyeoff'} /></button>
                      )}
                      {active && i.type !== 'quiz' && (
                        <button className="icon-btn ghost sm" aria-label={v.state.locked ? 'Open voting' : 'Close voting'} title={v.state.locked ? 'Open voting' : 'Close voting'} aria-pressed={v.state.locked} disabled={busy}
                          onClick={() => act({ action: 'lock', on: !v.state.locked })}><Icon name={v.state.locked ? 'lock' : 'unlock'} /></button>
                      )}
                      {active
                        ? <button className="go stop" aria-label={`Stop ${name}`} title="Stop" disabled={busy} onClick={stop}><Icon name="stop" /></button>
                        : <button className="go" aria-label={`Start ${name}`} title="Start" disabled={busy} onClick={() => start(i)}><Icon name="play" /></button>}
                      <Menu label={`More for ${name}`} className="icon-btn ghost sm" trigger={<Icon name="morev" />}>
                        <button disabled={index === 0} onClick={() => reorder(index, -1)}><Icon name="up" />Move up</button>
                        <button disabled={index === draft.interactions.length - 1} onClick={() => reorder(index, 1)}><Icon name="down" />Move down</button>
                        {room && <button onClick={() => duplicate(i)}><Icon name="copy" />Duplicate</button>}
                        <button className="danger" onClick={() => remove(i)}><Icon name="trash" />Delete</button>
                      </Menu>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <section className="hostdetail">
          <div className="dcard">
            {showing === 'add' && (
              <div className="stack">
                <div className="spread">
                  <h2 className="dtitle">Add</h2>
                  <button className="ghost" onClick={() => setView(item ? 'item' : 'qa')}>Close<Icon name="x" /></button>
                </div>
                <div className="typegrid">
                  {INTERACTION_TYPES.map((t) => {
                    /* A type the plan does not hold opens the account page, where Pro is bought. */
                    const onPro = t === 'survey' && !plan.surveys;
                    return (
                      <button key={t} type="button" className="typecard" onClick={onPro ? leaveTo('/app/account') : () => add(t)}>
                        <span className="thumb"><Sketch type={t} /></span>
                        <span className="label"><Icon name={TYPE_ICON[t]} size={20} />{TYPE_LABEL[t]}{onPro && <span className="pill-pro">Pro</span>}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* The Q&A stays in the page while something else is open, so a reply half typed is still there on coming back. */}
            <div className="stack" hidden={showing !== 'qa'}>
              <div className="dhead">
                <span className="kind"><Icon name="chat" size={24} /></span>
                <span className="dtitle">Q&A</span>
                {!v.state.qaOpen && !ended && <span className="pill-danger"><Icon name="lock" />Q&A closed</span>}
                <span className="grow" />
                <button className="ghost" onClick={() => setPanel('qa')}><Icon name="sliders" />Q&A settings</button>
              </div>
              {!ended && (
                <form className="field-row" onSubmit={(e) => { e.preventDefault(); void act({ action: 'announce', text: announcement ?? v.state.announcement }).then((ok) => { if (ok) setAnnouncement(null); }); }}>
                  <input aria-label="Announcement" placeholder="Announcement" maxLength={LIMITS.announcementChars} value={announcement ?? v.state.announcement} onChange={(e) => setAnnouncement(e.target.value)} />
                  <button type="submit" className="tall" disabled={busy || announcement === null || announcement === v.state.announcement}>Post</button>
                </form>
              )}
              <QaHost sessionId={id} questions={v.questions} state={v.state} moderation={draft.qa.moderation} ended={ended}
                onChange={(q, state) => setData((cur) => (cur ? { ...cur, questions: withQuestion(cur.questions, q), state: state.seq > cur.state.seq ? state : cur.state } : cur))} />
            </div>

            {showing === 'item' && item && (
              <ItemPanel v={v} item={item} now={now} ended={ended} answered={answeredOf(item)} onSettings={settingsPoll ? () => setPanel(panel === 'poll' ? null : 'poll') : undefined}
                onChange={editInteraction} onDelete={() => remove(item)} />
            )}
          </div>

          {showing !== 'add' && (
            <div className="startbar">
              {ended && <span className="tag">Ended</span>}
              {!ended && showing === 'qa' && (v.state.qaOpen
                ? <button className="tint-danger tall" disabled={busy} onClick={() => setConfirm({ title: 'Close Q&A', text: 'People can no longer send questions. Upvotes stay open.', action: 'Close Q&A', danger: true, run: () => void act({ action: 'qa-open', on: false }) })}><Icon name="lock" />Close Q&A</button>
                : <button className="tint-accent tall" disabled={busy} onClick={() => act({ action: 'qa-open', on: true })}><Icon name="unlock" />Open Q&A</button>)}
              {!ended && showing === 'item' && item && !itemActive && (
                <button className="primary tall" disabled={busy} onClick={() => act({ action: 'activate', id: item.id })}><Icon name="play" />{START[item.type]}</button>
              )}
              {!ended && showing === 'item' && item && itemActive && (
                <>
                  <button className="tint-danger tall" disabled={busy} onClick={stop}><Icon name="stop" />Stop</button>
                  {item.type === 'quiz' ? playing && <QuizBar quiz={item} v={v} now={now} busy={busy} act={act} /> : (
                    <>
                      <button className="ghost tall" disabled={busy || !neighbour(-1)} onClick={() => { const to = neighbour(-1); if (to) start(to); }}><Icon name="left" />Prev</button>
                      {item.type !== 'survey' && (
                        <button className={`icon-btn ghost tall ${v.state.showResults ? '' : 'on'}`} aria-label={v.state.showResults ? 'Hide results' : 'Show results'} title={v.state.showResults ? 'Hide results' : 'Show results'} aria-pressed={!v.state.showResults} disabled={busy}
                          onClick={() => act({ action: 'results', on: !v.state.showResults })}><Icon name={v.state.showResults ? 'eye' : 'eyeoff'} /></button>
                      )}
                      <button className={`icon-btn ghost tall ${v.state.locked ? 'on' : ''}`} aria-label={v.state.locked ? 'Open voting' : 'Close voting'} title={v.state.locked ? 'Open voting' : 'Close voting'} aria-pressed={v.state.locked} disabled={busy}
                        onClick={() => act({ action: 'lock', on: !v.state.locked })}><Icon name={v.state.locked ? 'lock' : 'unlock'} /></button>
                      <button className="ghost tall" disabled={busy || !neighbour(1)} onClick={() => { const to = neighbour(1); if (to) start(to); }}>Next<Icon name="right" /></button>
                    </>
                  )}
                </>
              )}
              {err && <span className="error" role="alert">{err}</span>}
              <span className="grow" />
              {ended
                ? <a className="btn" href={resultsHref} onClick={leaveTo(resultsHref)}><Icon name="trend" />Results</a>
                : <a className="btn ghost" href={`/s/${v.code}`} target="_blank" rel="noreferrer"><Icon name="phone" />Participant view</a>}
            </div>
          )}
        </section>
      </div>

      {panel === 'session' && (
        <Panel label="Settings" onClose={() => setPanel(null)}>
          <h3>Links</h3>
          <label>Join link
            <span className="field-row"><input readOnly value={joinLink} onFocus={(e) => e.target.select()} /><button type="button" className="icon-btn" aria-label="Copy join link" onClick={() => copy('Join link', joinLink)}><Icon name="copy" /></button></span>
          </label>
          <label>Projector link
            <span className="field-row"><input readOnly value={projector} onFocus={(e) => e.target.select()} /><button type="button" className="icon-btn" aria-label="Copy projector link" onClick={() => copy('Projector link', projector)}><Icon name="copy" /></button></span>
          </label>
          <h3>Q&A</h3>
          {qaSwitches}
        </Panel>
      )}
      {panel === 'qa' && <Panel label="Q&A settings" onClose={() => setPanel(null)}>{qaSwitches}</Panel>}
      {panel === 'poll' && settingsPoll && showing === 'item' && (
        <Panel label="Poll settings" onClose={() => setPanel(null)}>
          <PollSettings poll={settingsPoll} onChange={editInteraction} disabled={ended} />
        </Panel>
      )}
      {confirm && <Confirm ask={confirm} onClose={() => setConfirm(null)} />}
      {toast && <Toast text={toast} onDone={() => setToast(null)} />}
    </div>
  );
}

/** A small drawing of each type, for the cards it is picked from. Widths and heights are in percent. */
const SKETCH: Record<InteractionType, { kind: string; parts: number[] }> = {
  choice: { kind: 'bars', parts: [86, 38, 62] },
  wordcloud: { kind: 'cloud', parts: [48, 26, 36, 22, 30, 40] },
  rating: { kind: 'cols', parts: [100, 24, 44, 60, 60] },
  open: { kind: 'blocks', parts: [100, 78, 56] },
  ranking: { kind: 'bars', parts: [92, 70, 48, 28] },
  quiz: { kind: 'blocks', parts: [100, 100, 100] },
  survey: { kind: 'tiles', parts: [100, 100, 100, 100] },
};
function Sketch({ type }: { type: InteractionType }) {
  const { kind, parts } = SKETCH[type];
  return (
    <span className={`sk ${kind}`} aria-hidden>
      {parts.map((n, i) => <i key={i} className={i === 0 ? 'a' : ''} style={kind === 'cols' ? { height: `${n}%` } : { width: `${n}%` }} />)}
    </span>
  );
}

/** The open interaction: what is running in it now, then its fields with the results under them. */
function ItemPanel({ v, item, now, ended, answered, onSettings, onChange, onDelete }: {
  v: HostView;
  item: Interaction;
  now: number;
  ended: boolean;
  answered: number;
  /** Opens the poll's settings at the side; absent for a type with none. */
  onSettings?: () => void;
  onChange: (i: Interaction) => void;
  onDelete: () => void;
}) {
  const active = v.state.active === item.id;
  const q = item.type === 'quiz' && v.state.quiz?.quizId === item.id ? v.state.quiz : null;
  /* A quiz that has started keeps its questions, so its fields are read-only from then on. */
  const started = item.type === 'quiz' && (!!v.state.played?.includes(item.id) || (!!q && q.index >= 0));
  /* The running interaction's counts arrive live. Any other's are the stored ones, loaded when it is opened. */
  const stored = !active && v.shown?.id === item.id ? v.shown : null;

  return (
    <div className="stack">
      <div className="dhead">
        <span className="kind"><Icon name={TYPE_ICON[item.type]} size={24} /></span>
        <div className="who">
          <span className="dtitle">{TYPE_LABEL[item.type]}</span>
          <span className={`small num ${active ? 'live-dot' : 'muted'}`}>{answered} answered</span>
        </div>
        <span className="grow" />
        {!ended && <button className="icon-btn ghost" aria-label="Delete" title="Delete" onClick={onDelete}><Icon name="trash" /></button>}
        {onSettings && <button className="ghost" onClick={onSettings}><Icon name="sliders" />Poll settings</button>}
      </div>

      {active && item.type === 'quiz' && q && <QuizStage quiz={item} v={v} now={now} />}
      {active && item.type === 'survey' && (
        <div className="list">
          {item.polls.map((p, i) => <div key={p.id} className="spread"><span className="truncate"><span className="num faint">{i + 1}.</span> {p.title || 'Untitled'}</span><span className="muted num">{v.answered[p.id] ?? 0} answered</span></div>)}
        </div>
      )}

      {item.type === 'quiz' ? <QuizEditor quiz={item} onChange={onChange} disabled={ended || started} tallies={stored?.tallies} />
        : item.type === 'survey' ? <SurveyEditor survey={item} onChange={onChange} disabled={ended} tallies={stored?.tallies} texts={stored?.texts} />
        : <PollEditor poll={item} onChange={onChange} disabled={ended} settings={false}
            tally={active ? v.tally ?? EMPTY : stored?.tallies[item.id] ?? EMPTY} texts={active ? v.texts : stored?.texts[item.id]} />}
    </div>
  );
}

/** The quiz's one next step, by where it is: the first question, reveal, leaderboard or the next question. */
function QuizBar({ quiz, v, now, busy, act }: { quiz: Quiz; v: HostView; now: number; busy: boolean; act: Act }) {
  const q = v.state.quiz!;
  const phase = quizPhase(q, now);
  const last = q.index >= quiz.questions.length - 1;
  const step = (label: string, body: Record<string, unknown>, main = true) => (
    <button className={main ? 'primary tall' : 'tall'} disabled={busy} onClick={() => act(body)}>{label}<Icon name="right" /></button>
  );
  return (
    <>
      {phase === 'lobby' && step('First question', { action: 'quiz-next' })}
      {(phase === 'open' || phase === 'closed') && (
        <>
          {step('Reveal answer', { action: 'quiz-reveal' })}
          <span className="num strong" aria-label="Seconds left">{secondsLeft(q, now)} s</span>
        </>
      )}
      {phase === 'revealed' && (
        <>
          {!last && step('Next question', { action: 'quiz-next' })}
          {step('Leaderboard', { action: 'quiz-board', on: true }, last)}
        </>
      )}
      {phase === 'board' && !last && step('Next question', { action: 'quiz-next' })}
      <span className="muted num">{phase === 'lobby' ? `${v.people} joined` : `${q.index + 1} / ${quiz.questions.length} · ${v.tally?.people ?? 0} answered`}</span>
    </>
  );
}

/** The quiz as it runs: who has joined, the question in play with how people voted once time is up, or the leaderboard. */
function QuizStage({ quiz, v, now }: { quiz: Quiz; v: HostView; now: number }) {
  const q = v.state.quiz!;
  const phase = quizPhase(q, now);
  const question = quiz.questions[q.index];
  if (phase === 'board') return v.board ? <div className="sub"><Leaderboard entries={v.board.entries} /></div> : null;
  if (!question || phase === 'lobby') return <div className="sub"><div className="none slim"><span className="average num">{v.people}</span>joined</div></div>;
  return (
    <div className="sub">
      <div className="poll-title">{question.title}</div>
      <QuizResults question={question} tally={v.tally} spread={phase !== 'open'} correct={question.correctId} />
    </div>
  );
}
