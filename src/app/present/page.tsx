'use client';
/**
 * The big screen. The join instructions stay on the left; the right shows the poll or quiz the
 * facilitator has started, and otherwise the audience's questions.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon, TYPE_ICON, TYPE_LABEL } from '@/components/icons';
import { Qr } from '@/components/qr';
import { QaWall } from '@/components/qa';
import { QuizWall, useServerClock } from '@/components/quiz';
import { PollResults } from '@/components/results';
import { quizPhase } from '@/lib/engine/quiz';
import { joinPath } from '@/lib/links';
import { useWall } from '@/lib/use-host';

/** The session's id comes in the address as `?id=`. */
export default function PresentPage() {
  return <Suspense><Present /></Suspense>;
}

function Present() {
  const id = useSearchParams().get('id') ?? '';
  /* A projector PC that is not signed in opens the link with #k=<display key>. */
  const [key, setKey] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setKey(new URLSearchParams(window.location.hash.slice(1)).get('k'));
  }, []);
  if (key === undefined) return null;
  if (!id) return <main className="narrow"><p className="error">Not found</p></main>;
  return <Wall id={id} displayKey={key} />;
}

function Wall({ id, displayKey }: { id: string; displayKey: string | null }) {
  const { data: v, error, refresh } = useWall(id, displayKey);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const now = useServerClock(v?.serverNow);

  /* When a quiz question's time runs out, the screen fetches how people voted. */
  const q = v?.active?.kind === 'quiz' ? v.state.quiz : null;
  const phase = q ? quizPhase(q, now) : null;
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current === 'open' && phase === 'closed') void refresh();
    lastPhase.current = phase;
  }, [phase, refresh]);

  if (!v) return <main className="narrow"><p className="muted">{error ?? 'Loading…'}</p></main>;
  const host = origin.replace(/^https?:\/\//, '');
  const a = v.active;
  const ended = v.status === 'ended';
  const shownQuestions = v.questions.filter((x) => x.status === 'live').length;

  return (
    <div className="wall">
      <aside>
        <span className="wordmark">LearnBox Sessions</span>
        {!ended && (
          <div className="joinbox">
            <span>Join at</span>
            <b>{host}</b>
            <span className="code num"># {v.code.slice(0, 3)} {v.code.slice(3)}</span>
            {origin && <div style={{ marginTop: 16 }}><Qr url={`${origin}${joinPath(v.code)}`} size={180} /></div>}
          </div>
        )}
        <span className="muted num row"><Icon name="user" />{v.people}</span>
      </aside>

      <main>
        {ended ? (
          <>
            <div className="bar-head"><span>{v.title}</span></div>
            <div className="panel"><h1>Session ended</h1></div>
          </>
        ) : a?.kind === 'poll' ? (
          <>
            <div className="bar-head">
              <span><Icon name={TYPE_ICON[a.poll.type]} size={22} />{TYPE_LABEL[a.poll.type]}{v.state.locked && ' · Voting closed'}</span>
              <span className="num"><Icon name="user" size={22} />{v.tally?.people ?? 0}</span>
            </div>
            <div className="panel">
              <h1>{a.poll.title}</h1>
              {v.state.showResults
                ? <PollResults poll={a.poll} tally={v.tally} texts={v.texts} />
                : <span className="muted row" style={{ fontSize: 'clamp(16px, 1.4vw, 26px)' }}><Icon name="eyeoff" size={22} />Results are hidden</span>}
            </div>
          </>
        ) : a?.kind === 'survey' ? (
          <>
            <div className="bar-head"><span><Icon name="survey" size={22} />Survey</span></div>
            <div className="panel"><h1>{a.survey.title || 'Survey'}</h1><span className="muted num" style={{ fontSize: 'clamp(16px, 1.4vw, 26px)' }}>{a.survey.polls.length} questions</span></div>
          </>
        ) : a?.kind === 'quiz' && q ? (
          <>
            <div className="bar-head"><span><Icon name="quiz" size={22} />Quiz</span><span className="num"><Icon name="user" size={22} />{v.people}</span></div>
            <QuizWall title={a.title} count={a.count} question={a.question} q={q} now={now} tally={v.tally} board={v.board} people={v.people} />
          </>
        ) : (
          <>
            <div className="bar-head"><span><Icon name="chat" size={22} />Q&A</span><span className="num"><Icon name="chat" size={22} />{shownQuestions}</span></div>
            <QaWall questions={v.questions} state={v.state} />
          </>
        )}
      </main>
    </div>
  );
}
