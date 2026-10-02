'use client';
/**
 * The moving picture under the front page's heading. It tells one session as a story, the way
 * slido.com's video does: a phone scans the code and joins, votes in a poll, asks and upvotes a
 * question, sends a word, and plays a quiz. The big screen and the phone move between scenes, and a
 * touch mark shows where the person taps. It is drawn from the product's own screens. It stops
 * while it is off screen; for people who ask for reduced motion each scene shows finished.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/icons';
import {
  AskRow, Bars, barRows, Board, BOARD, Btn, Cloud, CODE, Field, Options, Panel, People, Phone, PhoneBoard, PhoneQuestion, PhoneVoted, PLabel,
  POLL, QUESTIONS, QUIZ, Screen, Sent, WallQuestions, WORDS,
} from './mock';

const TICK = 250;
/** The scenes in order, each with its length in ticks. */
const SCENES = [
  { name: 'Join', len: 20 },
  { name: 'Poll', len: 28 },
  { name: 'Q&A', len: 40 },
  { name: 'Word cloud', len: 26 },
  { name: 'Quiz', len: 32 },
] as const;
const STARTS = SCENES.map((_, i) => SCENES.slice(0, i).reduce((a, s) => a + s.len, 0));
const TOTAL = SCENES.reduce((a, s) => a + s.len, 0);

/* Where the big screen and the phone sit. A change of place is animated by CSS. */
const SCREEN = {
  enter: { transform: 'translate(12.5%, 14%) rotateX(32deg) scale(0.86)', opacity: 0 },
  wide: { transform: 'translate(12.5%, 0)', opacity: 1 },
  left: { transform: 'translate(0, 0)', opacity: 1 },
  back: { transform: 'translate(-9%, 0) rotateY(16deg) scale(0.9)', opacity: 0.35 },
};
const PHONE = {
  away: { transform: 'translate(90%, -24%) rotate(26deg)', opacity: 0 },
  scan: { transform: 'translate(-262%, 3%) rotate(-9deg) scale(0.84)', opacity: 1 },
  right: { transform: 'translate(0, 0)', opacity: 1 },
  focus: { transform: 'translate(-150%, 0) scale(1.14)', opacity: 1 },
};

interface Frame {
  screen: ReactNode;
  phone: ReactNode;
  at: keyof typeof SCREEN;
  held: keyof typeof PHONE;
  /** Where the person's finger is: a selector inside the phone, and whether it is pressing. */
  touch?: { on: string; down?: boolean };
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - (1 - v) ** 2;
const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
/** A touch that arrives at `from`, presses on the tick before `to`, and is gone at `to`. */
const tap = (k: number, from: number, to: number, on: string) => (k >= from && k < to ? { on, down: k === to - 1 } : undefined);

const Typed = ({ text, done }: { text: string; done: boolean }) => <span className={done ? '' : 'hd-caret'}>{text}</span>;

function join(k: number): Frame {
  const joined = k >= 10;
  return {
    at: k < 1 ? 'enter' : 'wide',
    held: k < 3 ? 'away' : k < 9 ? 'scan' : 'right',
    screen: (
      <Screen icon="chat" label="Q&A" count={0} countIcon="chat" people={joined ? Math.min(24, 1 + Math.round((k - 10) * 2.6)) : 0}>
        <div className="mk-none"><Icon name="chat" />No questions yet</div>
      </Screen>
    ),
    phone: k < 7 ? (
      <div className="mk-phone"><div className="mk-body hd-cam"><i className={k >= 5 ? 'on' : ''}>{k >= 5 && <Icon name="check" />}</i></div></div>
    ) : !joined ? (
      <div className="mk-phone"><div className="mk-body"><div className="mk-joinpage"><b className="mk-wm">LearnBox Sessions</b><span className="mk-pill num"><b>#</b>{CODE}<i><Icon name="right" /></i></span></div></div></div>
    ) : (
      <Phone tab="qa" fab><AskRow /><div className="mk-none"><Icon name="chat" />No questions yet</div></Phone>
    ),
    touch: tap(k, 8, 10, '.mk-pill i'),
  };
}

function poll(k: number): Frame {
  const shown = Math.min(POLL.options.length, k);
  const picked = k >= 6;
  const sent = k >= 10;
  const f = ease(clamp((k - 10) / 13));
  const counts = POLL.counts.map((c, i) => Math.max(sent && i === 0 ? 1 : 0, Math.round(c * f)));
  const people = sum(counts);
  return {
    at: 'left',
    held: 'right',
    screen: (
      <Screen icon="choice" label="Multiple choice" count={people}>
        <Panel key="poll" title={POLL.title}><Bars rows={barRows(POLL.options.slice(0, shown), counts.slice(0, shown))} /></Panel>
      </Screen>
    ),
    phone: (
      <Phone>
        {sent ? <PhoneVoted counts={counts} /> : (
          <>
            <PLabel icon="choice" label="Multiple choice" right={<People n={people} />} />
            <b className="mk-ptitle">{POLL.title}</b>
            <Options options={POLL.options.slice(0, shown)} picked={picked ? 0 : undefined} />
            <Btn primary dim={!picked}>Send</Btn>
          </>
        )}
      </Phone>
    ),
    touch: tap(k, 4, 6, '.mk-opt') ?? tap(k, 7, 10, '.mk-btn'),
  };
}

/* When each question reaches the list, in ticks. The first is the one typed on the phone. */
const ASKED = [18, 23, 27];
const ASK = QUESTIONS[0];

function qa(k: number): Frame {
  const typing = k >= 4 && k < 18;
  const text = ASK.text.slice(0, Math.max(0, k - 4) * 4);
  const items = QUESTIONS.map((q, i) => ({ ...q, votes: Math.round(q.votes * clamp((k - ASKED[i] - 1) / 11)), hi: i === 0 && k >= 35, voted: i === 1 && k >= 31 })).filter((_, i) => k >= ASKED[i]);
  return {
    at: k < 19 ? 'back' : 'left',
    held: k < 19 ? 'focus' : 'right',
    screen: (
      <Screen icon="chat" label="Q&A" count={items.length} countIcon="chat">
        {items.length ? <WallQuestions items={items} /> : <div className="mk-none"><Icon name="chat" />No questions yet</div>}
      </Screen>
    ),
    phone: (
      <Phone tab="qa" fab={!typing}>
        {typing ? (
          <div className="mk-sheetbox mk-in">
            <div className="mk-label"><b>Ask</b><Icon name="x" /></div>
            <Field><Typed text={text} done={text.length >= ASK.text.length} /></Field>
            <small className="mk-note num">{280 - text.length}</small>
            <Field><Icon name="user" />{ASK.name}</Field>
            <Btn primary dim={text.length < ASK.text.length}>Send</Btn>
          </div>
        ) : (
          <>
            <AskRow />
            {items.length ? items.slice(0, 2).map((q) => <PhoneQuestion key={q.id} q={q} />) : <div className="mk-none"><Icon name="chat" />No questions yet</div>}
          </>
        )}
      </Phone>
    ),
    touch: tap(k, 2, 4, '.mk-ask') ?? tap(k, 16, 18, '.mk-sheetbox .mk-btn') ?? tap(k, 29, 32, '[data-q="b"] .mk-votes'),
  };
}

const WORD = 'focused';
/* The order the words arrive in: the most sent first. */
const ARRIVE = [...WORDS].sort((a, b) => b[1] - a[1]).map(([w]) => w);

function cloud(k: number): Frame {
  const sent = k >= 12;
  const typed = sent ? '' : WORD.slice(0, Math.max(0, k - 2));
  const words = WORDS.map(([w, c]): [string, number] => {
    const at = 12 + ARRIVE.indexOf(w) * 1.5;
    return [w, k < at ? 0 : Math.max(1, Math.round(c * clamp((k - at) / 8)))];
  }).filter(([, c]) => c > 0);
  const people = Math.round(24 * clamp((k - 11) / 12));
  return {
    at: 'left',
    held: 'right',
    screen: <Screen icon="cloud" label="Word cloud" count={people}><Panel key="cloud" title="One word for this quarter"><Cloud words={words} /></Panel></Screen>,
    phone: (
      <Phone>
        <PLabel icon="cloud" label="Word cloud" right={<People n={people} />} />
        <b className="mk-ptitle">One word for this quarter</b>
        <Field empty={!typed}>{typed ? <Typed text={typed} done={typed === WORD} /> : 'Type a word'}</Field>
        <Btn primary dim={typed !== WORD}>Send</Btn>
        <small className="mk-note num">{sent ? 1 : 0} / 3</small>
        {sent && <Sent />}
      </Phone>
    ),
    touch: tap(k, 1, 3, '.mk-field') ?? tap(k, 10, 12, '.mk-btn'),
  };
}

const QUIZ_VOTES = [3, 16, 1, 4];

function quiz(k: number): Frame {
  const open = k < 12;
  const board = k >= 18;
  const answered = Math.min(24, Math.round(k * 2.4));
  const picked = k >= 3;
  /* The leaderboard builds from fifth place up to first. */
  const from = Math.max(0, BOARD.length - Math.floor((k - 17) / 2));
  return {
    at: 'left',
    held: 'right',
    screen: (
      <Screen icon="quiz" label="Quiz" count={24}>
        {board ? <Panel key="board" title={QUIZ.name}><Board rows={BOARD} from={from} /></Panel> : open ? (
          <Panel key="open" title={QUIZ.title} side={<b className="mk-timer num">{3 - Math.floor(k / 4)}</b>}>
            <div className="mk-letters">{QUIZ.options.map((o, i) => <span key={o}><i className="mk-letter">{'ABCD'[i]}</i>{o}</span>)}</div>
            <small className="mk-note num">2 / 5 · {answered} answered</small>
          </Panel>
        ) : (
          <Panel key="votes" title={QUIZ.title}>
            <Bars rows={QUIZ.options.map((o, i) => ({ key: o, label: <><i className="mk-letter">{'ABCD'[i]}</i> {o}{i === 1 && k >= 14 && ' ✓'}</>, value: String(QUIZ_VOTES[i]), share: QUIZ_VOTES[i] / 16, lead: i === 1 && k >= 14 }))} />
          </Panel>
        )}
      </Screen>
    ),
    phone: (
      <Phone>
        {k >= 20 ? <PhoneBoard /> : (
          <>
            <PLabel icon="quiz" label={QUIZ.name} right="2 / 5" />
            <b className="mk-ptitle">{QUIZ.title}</b>
            {open && <div className="mk-timerline num"><Icon name="clock" />{3 - Math.floor(k / 4)}<i><b style={{ width: `${((12 - k) / 12) * 15}%` }} /></i></div>}
            <div className={k >= 14 ? 'hd-right' : ''}><Options options={QUIZ.options} letters picked={picked ? 1 : undefined} /></div>
            {k >= 14 && <span className="mk-sent mk-in"><Icon name="check" />Correct<b className="num">+870</b></span>}
          </>
        )}
      </Phone>
    ),
    touch: tap(k, 1, 3, '.mk-opt:nth-child(2)'),
  };
}

const PLAY = [join, poll, qa, cloud, quiz];

export function HeroDemo() {
  const [t, setT] = useState(0);
  const [still, setStill] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const hand = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setStill(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (still) return;
    let seen = true;
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; }, { threshold: 0.15 });
    if (stage.current) io.observe(stage.current);
    const id = setInterval(() => {
      if (seen && !document.hidden) setT((v) => (v + 1) % TOTAL);
    }, TICK);
    return () => {
      clearInterval(id);
      io.disconnect();
    };
  }, [still]);

  let scene = STARTS.length - 1;
  while (STARTS[scene] > t) scene -= 1;
  const k = still ? SCENES[scene].len - 1 : t - STARTS[scene];
  const frame = PLAY[scene](k);
  const on = still ? undefined : frame.touch?.on;

  /* The touch mark sits on the middle of the part it names, measured in the phone's own layout. */
  useLayoutEffect(() => {
    const box = hand.current;
    const el = on && box ? box.querySelector<HTMLElement>(on) : null;
    if (!box || !el) return;
    let x = el.offsetWidth / 2;
    let y = el.offsetHeight / 2;
    for (let n: HTMLElement | null = el; n && n !== box;) {
      const p = n.offsetParent as HTMLElement | null;
      x += n.offsetLeft + (p?.clientLeft ?? 0);
      y += n.offsetTop + (p?.clientTop ?? 0);
      n = p;
    }
    const next = { x: (x / box.offsetWidth) * 100, y: (y / box.offsetHeight) * 100 };
    setSpot((cur) => (cur && Math.abs(cur.x - next.x) < 0.2 && Math.abs(cur.y - next.y) < 0.2 ? cur : next));
  }, [on, t]);

  return (
    <div className="s-stage" ref={stage}>
      <div className={`hd ${still ? 'still' : ''}`} role="img" aria-label={`${SCENES[scene].name}: the big screen and a phone`}>
        <div className="hd-screen" style={SCREEN[frame.at]}>{frame.screen}</div>
        <div className="hd-phone" style={PHONE[frame.held]} ref={hand}>
          {frame.phone}
          <i className={`hd-touch ${on ? 'on' : ''} ${frame.touch?.down ? 'down' : ''}`} style={spot ? { left: `${spot.x}%`, top: `${spot.y}%` } : undefined} />
        </div>
      </div>
      <div className="s-scenes" role="tablist" aria-label="What the picture shows">
        {SCENES.map((s, i) => (
          <button key={s.name} type="button" role="tab" aria-selected={scene === i} onClick={() => setT(STARTS[i])}>
            {s.name}
            <i aria-hidden><b style={{ width: scene === i ? `${((k + 1) / s.len) * 100}%` : '0%' }} /></i>
          </button>
        ))}
      </div>
    </div>
  );
}
