'use client';
/**
 * A working example on the site: vote or ask on the drawn phone, and the drawn big screen follows.
 * It runs in the visitor's browser on made-up answers; nothing is sent anywhere.
 */
import { useState } from 'react';
import { Icon } from '@/components/icons';
import { Bars, barRows, Panel, People, Phone, PhoneQuestion, PLabel, POLL, QUESTIONS, Screen, Sent, WallQuestions, type MockQuestion } from './mock';

const BASE = [9, 4, 6];
const MAX = 140;

function PollDemo() {
  const [pick, setPick] = useState<number | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [editing, setEditing] = useState(true);
  const counts = BASE.map((c, i) => c + (sent === i ? 1 : 0));
  const people = counts.reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="s-try-phone">
        <h3><Icon name="phone" size={20} />On a phone</h3>
        <Phone>
          <PLabel icon="choice" label="Multiple choice" right={<People n={people} />} />
          <b className="mk-ptitle">{POLL.title}</b>
          {editing ? (
            <>
              <div className="mk-opts" role="radiogroup" aria-label={POLL.title}>
                {POLL.options.map((o, i) => (
                  <button key={o} type="button" role="radio" aria-checked={pick === i} className={`mk-opt ${pick === i ? 'picked' : ''}`} onClick={() => setPick(i)}><i className="mk-radio" />{o}</button>
                ))}
              </div>
              <button type="button" className="mk-btn primary" disabled={pick === null} onClick={() => { setSent(pick); setEditing(false); }}>Send</button>
            </>
          ) : (
            <>
              <div className="mk-card"><Bars rows={barRows(POLL.options, counts, sent ?? undefined)} /></div>
              <Sent />
              <button type="button" className="mk-btn" onClick={() => setEditing(true)}>Edit response</button>
            </>
          )}
        </Phone>
      </div>
      <div className="s-try-screen">
        <h3><Icon name="screen" size={20} />On the big screen</h3>
        <Screen icon="choice" label="Multiple choice" count={people} people={people}><Panel title={POLL.title}><Bars rows={barRows(POLL.options, counts)} /></Panel></Screen>
      </div>
    </>
  );
}

function QaDemo() {
  const [added, setAdded] = useState<MockQuestion[]>([]);
  const [up, setUp] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const all = [...QUESTIONS, ...added].map((q) => ({ ...q, votes: q.votes + (up.includes(q.id) ? 1 : 0), voted: up.includes(q.id) }));
  /* Most upvoted first; equal votes keep the order they were asked in. */
  const list = all.map((q, i) => ({ q, i })).sort((a, b) => b.q.votes - a.q.votes || a.i - b.i).map((x) => x.q);
  const text = draft.replace(/\s+/g, ' ').trim();
  const ask = () => {
    if (!text) return;
    setAdded((cur) => [...cur.slice(-2), { id: `n${Date.now()}`, name: '', text, votes: 0 }]);
    setDraft('');
  };
  return (
    <>
      <div className="s-try-phone">
        <h3><Icon name="phone" size={20} />On a phone</h3>
        <Phone tab="qa">
          <form className="mk-askform" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <input aria-label="Your question" placeholder="Type your question" maxLength={MAX} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button type="submit" className="mk-btn primary" disabled={!text}>Send</button>
          </form>
          <div className="mk-scroll">
            {list.map((q) => <PhoneQuestion key={q.id} q={q} onVote={() => setUp((cur) => (cur.includes(q.id) ? cur.filter((x) => x !== q.id) : [...cur, q.id]))} />)}
          </div>
        </Phone>
      </div>
      <div className="s-try-screen">
        <h3><Icon name="screen" size={20} />On the big screen</h3>
        <Screen icon="chat" label="Q&A" count={list.length} countIcon="chat"><WallQuestions items={list.slice(0, 3)} /></Screen>
      </div>
    </>
  );
}

export function TryIt({ kind }: { kind: 'poll' | 'qa' }) {
  return <div className="s-try">{kind === 'poll' ? <PollDemo /> : <QaDemo />}</div>;
}
