/**
 * Drawings of the product's own screens for the site: the big screen in a browser window and the
 * phone, with the pieces they show. Sizes are in container units, so a drawing scales with its frame.
 */
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';

export const HOST = 'sessions.learnbox.one';
export const CODE = '482 913';

/** A drawn QR code: the three corner squares and a fixed pattern between them. */
function QrDrawing() {
  const N = 21;
  const corner = (x: number, y: number) => (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7);
  const ring = (x: number, y: number) => {
    const cx = x < 7 ? x : x - (N - 7);
    const cy = y < 7 ? y : y - (N - 7);
    const edge = cx === 0 || cx === 6 || cy === 0 || cy === 6;
    const core = cx >= 2 && cx <= 4 && cy >= 2 && cy <= 4;
    return edge || core;
  };
  let d = '';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const gap = (x === 7 && y < 8) || (y === 7 && x < 8) || (x === N - 8 && y < 8) || (y === 7 && x >= N - 8) || (x === 7 && y >= N - 8) || (y === N - 8 && x < 8);
      const on = corner(x, y) ? ring(x, y) : !gap && (x * 7 + y * 13 + ((x * y) % 5) + ((x ^ y) % 3)) % 2 === 0;
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return <svg className="mk-qr" viewBox={`0 0 ${N} ${N}`} aria-hidden><path d={d} fill="#000" /></svg>;
}

/** The big screen in a browser window: the join instructions on the left, what is running on the right. */
export function Screen({ icon, label, count, countIcon = 'user', people = 24, children }: {
  icon: IconName; label: string; count: number; countIcon?: IconName; people?: number; children: ReactNode;
}) {
  return (
    <div className="mk-screen">
      <div className="mk-win">
        <div className="mk-chrome"><i /><i /><i /></div>
        <div className="mk-wall">
          <aside>
            <b className="mk-wm">LearnBox Sessions</b>
            <div className="mk-join">
              <span>Join at</span>
              <b>{HOST}</b>
              <b className="mk-code num"># {CODE}</b>
              <QrDrawing />
            </div>
            <span className="mk-people num"><Icon name="user" />{people}</span>
          </aside>
          <main>
            <div className="mk-head"><span><Icon name={icon} />{label}</span><span className="num"><Icon name={countIcon} />{count}</span></div>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

/** The phone: its bar with the two tabs, then the page. */
export function Phone({ tab = 'polls', fab, children }: { tab?: 'qa' | 'polls'; fab?: boolean; children: ReactNode }) {
  return (
    <div className="mk-phone">
      <div className="mk-body">
        <div className="mk-appbar">
          <Icon name="menu" />
          <div className="mk-tabs">
            <span className={tab === 'qa' ? 'on' : ''}><Icon name="chat" />Q&A</span>
            <span className={tab === 'polls' ? 'on' : ''}><Icon name="bars" />Polls</span>
          </div>
          <span className="mk-av"><Icon name="user" /></span>
        </div>
        <div className="mk-page">{children}</div>
        {fab && <span className="mk-fab">Ask</span>}
      </div>
    </div>
  );
}

/** The screen with the phone in front of its right edge. */
export function Duo({ screen, phone }: { screen: ReactNode; phone: ReactNode }) {
  return <div className="mk-duo">{screen}<div className="mk-duo-phone">{phone}</div></div>;
}

/** A phone on its own, on a tinted tile. */
export function Solo({ children }: { children: ReactNode }) {
  return <div className="mk-solo"><div>{children}</div></div>;
}

/** A piece of the facilitator's screen, as a card on a tinted tile. */
export function Sheet({ children }: { children: ReactNode }) {
  return <div className="mk-sheet"><div className="mk-paper">{children}</div></div>;
}

export function Panel({ title, side, children }: { title: string; side?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mk-panel mk-in">
      <div className="mk-title"><b>{title}</b>{side}</div>
      {children}
    </div>
  );
}

export function PLabel({ icon, label, right }: { icon: IconName; label: string; right?: ReactNode }) {
  return <div className="mk-label"><span><Icon name={icon} />{label}</span>{right != null && <span className="num">{right}</span>}</div>;
}
export const People = ({ n }: { n: number }) => <><Icon name="user" />{n}</>;

export interface BarRow { label: ReactNode; key: string; value: string; share: number; lead?: boolean; mine?: boolean }

/** Rows for `Bars` from counts: each option's share of all votes, the longest bar filling the row. */
export function barRows(labels: string[], counts: number[], mine?: number): BarRow[] {
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...counts);
  const top = Math.max(...counts);
  return labels.map((label, i) => ({
    key: label, label, value: `${total ? Math.round((counts[i] / total) * 100) : 0}%`, share: counts[i] / max, lead: top > 0 && counts[i] === top, mine: mine === i,
  }));
}

export function Bars({ rows }: { rows: BarRow[] }) {
  return (
    <div className="mk-bars">
      {rows.map((r) => (
        <div key={r.key} className={`mk-bar mk-in ${r.lead ? 'lead' : ''}`}>
          <span>{r.label}{r.mine && <Icon name="user" />}</span>
          <div><i style={{ width: `calc(${Math.max(0, Math.min(1, r.share))} * (100% - 5ch))` }} /><b className="num">{r.value}</b></div>
        </div>
      ))}
    </div>
  );
}

/** Words sized by how often they were sent. */
export function Cloud({ words }: { words: [string, number][] }) {
  const top = Math.max(1, ...words.map(([, c]) => c));
  return (
    <div className="mk-cloud">
      {words.map(([w, c]) => <span key={w} className="mk-in" style={{ fontSize: `${1 + (c / top) * 1.9}em`, fontWeight: c === top ? 700 : 500, opacity: 0.6 + (c / top) * 0.4 }}>{w}</span>)}
    </div>
  );
}

export interface MockQuestion { id: string; name: string; text: string; votes: number; hi?: boolean; voted?: boolean; reply?: string }
const initial = (name: string) => (name ? name[0].toUpperCase() : <Icon name="user" />);

/** Questions as the big screen lists them. */
export function WallQuestions({ items }: { items: MockQuestion[] }) {
  return (
    <div className="mk-wqs">
      {items.map((q) => (
        <div key={q.id} className={`mk-wq mk-in ${q.hi ? 'hi' : ''}`}>
          <div><span><i className="mk-dot">{initial(q.name)}</i>{q.name || 'Anonymous'}</span><span className="num">{q.votes}<Icon name="thumb" /></span></div>
          <p>{q.text}</p>
        </div>
      ))}
    </div>
  );
}

/** One question as a phone shows it. `onVote` makes its upvote a working button. */
export function PhoneQuestion({ q, onVote }: { q: MockQuestion; onVote?: () => void }) {
  const votes = <>{q.votes}<Icon name="thumb" /></>;
  return (
    <div className={`mk-q mk-in ${q.hi ? 'hi' : ''}`} data-q={q.id}>
      <div className="head">
        <i className="mk-dot">{initial(q.name)}</i>
        <span className="who"><b>{q.name || 'Anonymous'}</b><small>now</small></span>
        {onVote
          ? <button type="button" className={`mk-votes num ${q.voted ? 'on' : ''}`} aria-pressed={!!q.voted} aria-label={`Upvote: ${q.text}`} onClick={onVote}>{votes}</button>
          : <span className={`mk-votes num ${q.voted ? 'on' : ''}`}>{votes}</span>}
      </div>
      <p>{q.text}</p>
      {q.reply && <div className="mk-reply"><span><Icon name="reply" /><b>Host</b></span>{q.reply}</div>}
    </div>
  );
}

export function AskRow() {
  return <div className="mk-ask"><i className="mk-dot"><Icon name="user" /></i>Type your question</div>;
}

/** A quiz's leaderboard. `from` shows only the rows from that place down, for building it up from the bottom. */
export function Board({ rows, from = 0 }: { rows: [string, string][]; from?: number }) {
  return (
    <div className="mk-board">
      {rows.map(([name, points], i) => (
        <div key={name} className={`mk-row ${i === 0 ? 'first' : ''} ${i < from ? 'off' : ''}`}><b className="num">{i + 1}</b><span>{name}</span><b className="num">{points}</b></div>
      ))}
    </div>
  );
}

export function Options({ options, picked, letters }: { options: string[]; picked?: number; letters?: boolean }) {
  return (
    <div className="mk-opts">
      {options.map((o, i) => (
        <span key={o} className={`mk-opt ${picked === i ? 'picked' : ''}`}>{letters ? <i className="mk-letter">{'ABCD'[i]}</i> : <i className="mk-radio" />}{o}</span>
      ))}
    </div>
  );
}

export const Sent = () => <span className="mk-sent"><Icon name="check" />Sent</span>;
export const Btn = ({ primary, dim, children }: { primary?: boolean; dim?: boolean; children: ReactNode }) => <span className={`mk-btn ${primary ? 'primary' : ''} ${dim ? 'dim' : ''}`}>{children}</span>;
export const Field = ({ children, empty }: { children: ReactNode; empty?: boolean }) => <span className={`mk-field ${empty ? 'empty' : ''}`}>{children}</span>;

/* What the drawings show. */
export const POLL = { title: 'Which topic should we start with?', options: ['Roadmap', 'Hiring plan', 'Customer feedback'], counts: [14, 4, 6] };
export const WORDS: [string, number][] = [['steady', 4], ['busy', 6], ['focused', 9], ['growth', 5], ['proud', 2], ['learning', 3], ['stretched', 2]];
export const QUESTIONS: MockQuestion[] = [
  { id: 'a', name: 'Asha', text: 'Will the roadmap change after this quarter?', votes: 12 },
  { id: 'b', name: '', text: 'How many people are we hiring this year?', votes: 9 },
  { id: 'c', name: 'Dev', text: 'When does the new office open?', votes: 5 },
];
export const BOARD: [string, string][] = [['Rohan', '4,310'], ['Meera', '3,980'], ['Dev', '3,720'], ['Asha', '3,150'], ['Kabir', '2,890']];
export const QUIZ = { name: 'Planets', title: 'Which planet is the largest?', options: ['Earth', 'Jupiter', 'Mars', 'Saturn'] };

/** The phone after its quiz: the place, the points, the top of the leaderboard. */
export function PhoneBoard() {
  return (
    <>
      <PLabel icon="quiz" label={QUIZ.name} right={<People n={24} />} />
      <div className="mk-medal"><Icon name="medal" /><b className="num">2 / 24</b></div>
      <div className="mk-pair"><span><small>Points</small><b className="num">3,980</b></span><span><small>Last</small><b className="num">+870</b></span></div>
      <Board rows={BOARD.slice(0, 3)} />
    </>
  );
}

/** A poll on the phone once this person has voted: the results with their pick marked. */
export function PhoneVoted({ counts = POLL.counts, mine = 0 }: { counts?: number[]; mine?: number }) {
  return (
    <>
      <PLabel icon="choice" label="Multiple choice" right={<People n={counts.reduce((a, b) => a + b, 0)} />} />
      <b className="mk-ptitle">{POLL.title}</b>
      <div className="mk-card"><Bars rows={barRows(POLL.options, counts, mine)} /></div>
      <Sent />
      <Btn>Edit response</Btn>
    </>
  );
}
