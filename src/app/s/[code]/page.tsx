'use client';
/**
 * The audience's phone. It joins with the code and shows two tabs: Q&A, open for the whole
 * session, and Polls, which holds whatever the facilitator has started.
 */
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/dialog';
import { Icon } from '@/components/icons';
import { PollForm, SurveyForm } from '@/components/poll-form';
import { QaPhone } from '@/components/qa';
import { QuizPhone, useServerClock, type Me } from '@/components/quiz';
import { PollResults } from '@/components/results';
import { browserToken, saveName } from '@/lib/audience';
import type { BoardEntry } from '@/lib/engine/quiz';
import { LIMITS } from '@/lib/limits';
import { post, request } from '@/lib/net';
import { stateChannel, tallyChannel, type ActiveForAudience, type PushEvent } from '@/lib/push/events';
import { useLive } from '@/lib/use-live';
import type { Answer, QaSettings, SessionState, Tally } from '@/lib/types';

/** The active interaction with what this person has sent, and what they may see of the results. */
type Active =
  | (Extract<ActiveForAudience, { kind: 'poll' }> & { mine: Answer[]; tally: Tally | null })
  | (Extract<ActiveForAudience, { kind: 'survey' }> & { mine: Record<string, Answer[]> })
  | (Extract<ActiveForAudience, { kind: 'quiz' }> & { mine: Answer[]; people?: number; me?: Me; top?: BoardEntry[] });

interface View {
  id: string;
  code: string;
  title: string;
  status: 'live' | 'ended';
  state: SessionState;
  qa: QaSettings;
  serverNow: number;
  joined: boolean;
  nickname: string;
  active: Active | null;
}

const activeId = (a: ActiveForAudience | null) => (!a ? null : a.kind === 'poll' ? a.poll.id : a.kind === 'survey' ? a.survey.id : a.id);

export default function AudiencePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [id, setId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await request(`/api/join/${code}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!alive) return;
      if (!r.ok) return setProblem(j.error ?? 'No session with that code');
      const jr = await post(`/api/live/${j.id}`, { token: browserToken() });
      const jj = await jr.json().catch(() => ({}));
      if (!alive) return;
      if (!jr.ok) return setProblem(jj.error ?? 'Could not join');
      setId(j.id);
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  if (problem) {
    return (
      <main className="narrow stack">
        <div className="card notice"><span className="dot"><Icon name="lock" /></span>{problem}</div>
        <a className="btn" href="/">Enter another code</a>
      </main>
    );
  }
  if (!id) return <main className="narrow"><p className="muted">Joining…</p></main>;
  return <Joined id={id} />;
}

function Joined({ id }: { id: string }) {
  const token = browserToken();
  const load = useCallback(async () => {
    const r = await request(`/api/live/${id}?t=${token}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('Connection lost');
    return (await r.json()) as View;
  }, [id, token]);

  /* A pushed state carries the active interaction but nothing personal: what this phone sent is
     kept while the same poll or quiz question stays up, and dropped when it changes. */
  const apply = useCallback((cur: View, e: PushEvent): View => {
    if (e.kind === 'state') {
      if (e.seq <= cur.state.seq) return cur;
      const had = cur.active;
      let active: Active | null = null;
      if (e.active?.kind === 'poll') {
        const same = had?.kind === 'poll' && had.poll.id === e.active.poll.id;
        active = { ...e.active, mine: same ? had.mine : [], tally: same && e.state.showResults ? had.tally : null };
      } else if (e.active?.kind === 'survey') {
        active = { ...e.active, mine: had?.kind === 'survey' && had.survey.id === e.active.survey.id ? had.mine : {} };
      } else if (e.active?.kind === 'quiz') {
        const same = had?.kind === 'quiz' && had.id === e.active.id && had.question?.id === e.active.question?.id;
        active = { ...e.active, mine: same ? had.mine : [], people: had?.kind === 'quiz' ? had.people : undefined, me: same ? had.me : undefined, top: same ? had.top : undefined };
      }
      return { ...cur, status: e.status, state: e.state, serverNow: e.now, active };
    }
    if (e.kind === 'tally' && !e.withheld && cur.active?.kind === 'poll' && cur.active.poll.id === e.pollId && cur.state.showResults) {
      return { ...cur, active: { ...cur.active, tally: e.tally } };
    }
    return cur;
  }, []);

  const [channels, setChannels] = useState<string[]>([stateChannel(id)]);
  const reload = useRef<() => void>(() => {});
  const shown = useRef(true);
  const { data: v, setData, error, refresh } = useLive<View>(load, channels, apply, {
    stale: (cur, next) => next.state.seq < cur.state.seq,
    /* Two things a pushed state cannot carry, so a reload fetches them: in a quiz, this person's
       own answer, points and place; and the counts when results are switched back on. The wait is
       random so a full room does not ask in the same instant. */
    onEvent: (e) => {
      if (e.kind !== 'state') return;
      const turnedOn = e.state.showResults && !shown.current;
      shown.current = e.state.showResults;
      if (e.active?.kind === 'quiz' || (turnedOn && e.active?.kind === 'poll')) setTimeout(() => reload.current(), Math.random() * 1200);
    },
  });
  reload.current = () => void refresh();
  const now = useServerClock(v?.serverNow);
  useEffect(() => {
    if (v) shown.current = v.state.showResults;
  }, [v]);

  const pollId = v?.active?.kind === 'poll' && v.state.showResults ? v.active.poll.id : null;
  useEffect(() => {
    setChannels(pollId ? [stateChannel(id), tallyChannel(id, pollId)] : [stateChannel(id)]);
  }, [id, pollId]);

  /* Starting a poll brings its tab forward, as the facilitator means everyone to answer it. Both
     tabs stay in the page, so a question half typed is still there on coming back. */
  const [tab, setTab] = useState<'qa' | 'polls'>('qa');
  const current = activeId(v?.active ?? null);
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!v) return;
    if (current && current !== seen.current) setTab('polls');
    /* When it stops with nothing started in its place, the phone goes back to the Q&A. */
    if (!current && seen.current) setTab('qa');
    seen.current = current;
  }, [v, current]);
  /* Once this person has answered or asked something, the page offers them a session of their own. */
  const [offer, setOffer] = useState<'no' | 'show' | 'closed'>('no');
  const engaged = useCallback(() => setOffer((cur) => (cur === 'no' ? 'show' : cur)), []);

  const [naming, setNaming] = useState(false);
  const [menu, setMenu] = useState(false);
  /* Dark or light as shown now: the choice made on this device, or else the device's own setting. */
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const chosen = document.documentElement.dataset.theme;
    setDark(chosen ? chosen === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);
  const setTheme = (on: boolean) => {
    const theme = on ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('la-theme', theme);
    } catch {
      /* Storage is off in some private windows; the theme then lasts for this page. */
    }
    setDark(on);
  };
  const setName = useCallback(async (name: string): Promise<string | null> => {
    const r = await post(`/api/live/${id}`, { token, nickname: name });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return j.error ?? 'Not saved';
    saveName(name);
    setData((cur) => (cur ? { ...cur, nickname: j.nickname } : cur));
    return null;
  }, [id, token, setData]);

  const answer = useCallback(async (body: Record<string, unknown>): Promise<string | null> => {
    const r = await post(`/api/live/${id}/answer`, { token, ...body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return j.error ?? 'Not sent';
    if (j.tally) setData((cur) => (cur?.active?.kind === 'poll' ? { ...cur, active: { ...cur.active, tally: j.tally } } : cur));
    await refresh();
    engaged();
    return null;
  }, [id, token, setData, refresh, engaged]);

  if (!v) return <main className="narrow"><p className="muted">{error ?? 'Joining…'}</p></main>;
  const ended = v.status === 'ended';
  const a = v.active;

  return (
    <>
      <header className="appbar">
        <span className="start">
          <button className="avatar" aria-label="Menu" onClick={() => setMenu(true)}><Icon name="menu" size={20} /></button>
          <span className="title truncate">{v.title}</span>
        </span>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'qa'} onClick={() => setTab('qa')}><Icon name="chat" />Q&A</button>
          <button role="tab" aria-selected={tab === 'polls'} onClick={() => setTab('polls')}>
            <Icon name="bars" />Polls{a && tab !== 'polls' && !ended && <span className="badge" aria-label="A poll is open" />}
          </button>
        </div>
        <button className="avatar end" aria-label={v.nickname ? `Name: ${v.nickname}` : 'Add your name'} onClick={() => setNaming(true)}>
          {v.nickname ? v.nickname.charAt(0).toUpperCase() : <Icon name="user" />}
        </button>
      </header>

      {naming && (
        <Dialog label="Your name" onClose={() => setNaming(false)}>
          <NameCard name={v.nickname} onSave={async (n) => { const e = await setName(n); if (!e) setNaming(false); return e; }} onClose={() => setNaming(false)} />
        </Dialog>
      )}
      {menu && (
        <Dialog label={v.title} onClose={() => setMenu(false)}>
          <span className="muted num"># {v.code.slice(0, 3)} {v.code.slice(3)}</span>
          <section>
            <a className="btn ghost start" href="/"><Icon name="swap" />Enter another code</a>
            <label className="switch"><span className="row"><Icon name="moon" />Dark mode</span><input type="checkbox" checked={dark} onChange={(e) => setTheme(e.target.checked)} /></label>
          </section>
          <section>
            <a className="btn wide" href="/sign-in">Create a session</a>
            <span className="wordmark" style={{ justifySelf: 'center' }}>LearnBox Sessions</span>
          </section>
        </Dialog>
      )}

      <main className="column stack">
        {ended && <div className="card notice"><span className="dot"><Icon name="lock" /></span>Session ended</div>}

        <div hidden={tab !== 'qa'}>
          <QaPhone sessionId={id} token={token} state={v.state} settings={v.qa} nickname={v.nickname} ended={ended} onEngage={engaged} />
        </div>

        {!ended && (
          <section className="stack" hidden={tab !== 'polls'}>
            {!a && <div className="none"><Icon name="bars" size={40} />No active poll</div>}
            {a?.kind === 'poll' && (
              /* Written answers are for the big screen; a phone shows the counts of the other kinds. */
              <PollForm key={a.poll.id} poll={a.poll} mine={a.mine} locked={v.state.locked} name={v.nickname} people={a.tally?.people}
                hidden={!v.state.showResults && a.poll.type !== 'open'}
                results={v.state.showResults && a.tally && a.poll.type !== 'open'
                  ? <PollResults poll={a.poll} tally={a.tally} mine={a.mine[0]?.type === 'choice' ? a.mine[0].optionIds : undefined} />
                  : undefined}
                onSend={(answer_) => answer({ pollId: a.poll.id, answer: answer_ })} />
            )}
            {a?.kind === 'survey' && (
              <SurveyForm key={a.survey.id} survey={a.survey} mine={a.mine} locked={v.state.locked} name={v.nickname}
                onSend={(answers) => answer({ surveyId: a.survey.id, answers })} />
            )}
            {a?.kind === 'quiz' && v.state.quiz && (
              <QuizPhone title={a.title} count={a.count} question={a.question} q={v.state.quiz} now={now} mine={a.mine} me={a.me} top={a.top} people={a.people}
                nickname={v.nickname} onName={setName} onSend={(answer_) => answer({ pollId: a.question?.id, answer: answer_ })} />
            )}
          </section>
        )}
      </main>
      <footer className="footer">
        {offer === 'show' && (
          <div className="offer">
            <button type="button" className="icon-btn ghost sm" aria-label="Close" onClick={() => setOffer('closed')}><Icon name="x" /></button>
            <span>LearnBox Sessions is free to use at your own meetings.</span>
            <a className="btn primary pill tall" href="/sign-in?mode=up">Create a session</a>
          </div>
        )}
        <span className="wordmark">LearnBox Sessions</span>
      </footer>
    </>
  );
}

function NameCard({ name, onSave, onClose }: { name: string; onSave: (name: string) => Promise<string | null>; onClose: () => void }) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setErr(null);
      const problem = await onSave(value.trim());
      setBusy(false);
      if (problem) setErr(problem);
    }}>
      <input aria-label="Your name" placeholder="Your name" value={value} maxLength={LIMITS.nicknameChars} autoFocus onChange={(e) => setValue(e.target.value)} />
      {err && <p className="error small" role="alert">{err}</p>}
      <div className="row">
        <button type="submit" className="primary" disabled={busy || !value.trim()}>Save</button>
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}
