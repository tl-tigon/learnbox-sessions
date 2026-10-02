'use client';
/**
 * The moving picture under the front page's heading: the big screen and a phone, playing a poll,
 * the Q&A, a word cloud and a quiz in turn. It is drawn from the product's own screens. It stops
 * while it is off screen, and for people who ask for reduced motion it shows each scene finished.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AskRow, Bars, barRows, Board, BOARD, Btn, Cloud, Duo, Field, Options, Panel, People, Phone, PhoneBoard, PhoneQuestion, PhoneVoted, PLabel,
  POLL, QUESTIONS, QUIZ, Screen, WallQuestions, WORDS,
} from './mock';

const TICK = 250;
/** Ticks in one scene. */
const LEN = 26;
const SCENES = ['Poll', 'Q&A', 'Word cloud', 'Quiz'] as const;

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - (1 - v) ** 2;

/* When each question arrives, in ticks. */
const ASKED = [1, 5, 9];
const WORD = 'focused';
/* The order the words arrive in: the most sent first. */
const ARRIVE = [...WORDS].sort((a, b) => b[1] - a[1]).map(([w]) => w);

function PollScene({ k }: { k: number }) {
  const f = ease(clamp((k - 3) / 15));
  const counts = POLL.counts.map((c) => Math.round(c * f));
  const people = counts.reduce((a, b) => a + b, 0);
  return (
    <Duo
      screen={<Screen icon="choice" label="Multiple choice" count={people} people={24}><Panel title={POLL.title}><Bars rows={barRows(POLL.options, counts)} /></Panel></Screen>}
      phone={(
        <Phone>
          {k < 10 ? (
            <>
              <PLabel icon="choice" label="Multiple choice" right={<People n={people} />} />
              <b className="mk-ptitle">{POLL.title}</b>
              <Options options={POLL.options} picked={k >= 5 ? 0 : undefined} />
              <Btn primary dim={k < 5}>Send</Btn>
            </>
          ) : <PhoneVoted counts={counts} />}
        </Phone>
      )}
    />
  );
}

function QaScene({ k }: { k: number }) {
  const items = QUESTIONS.map((q, i) => ({ ...q, votes: Math.round(q.votes * clamp((k - ASKED[i]) / 11)), hi: i === 0 && k >= 20 })).filter((_, i) => k >= ASKED[i]);
  return (
    <Duo
      screen={<Screen icon="chat" label="Q&A" count={items.length} countIcon="chat"><WallQuestions items={items} /></Screen>}
      phone={<Phone tab="qa" fab><AskRow />{items.slice(0, 2).map((q, i) => <PhoneQuestion key={q.id} q={{ ...q, voted: i === 0 && k >= 13 }} />)}</Phone>}
    />
  );
}

function CloudScene({ k }: { k: number }) {
  const words = WORDS.map(([w, c]): [string, number] => {
    const at = 2 + ARRIVE.indexOf(w) * 2;
    return [w, k < at ? 0 : Math.max(1, Math.round(c * clamp((k - at) / 10)))];
  }).filter(([, c]) => c > 0);
  const sent = k >= 10;
  return (
    <Duo
      screen={<Screen icon="cloud" label="Word cloud" count={Math.round(24 * clamp(k / 20))}><Panel title="One word for this quarter"><Cloud words={words} /></Panel></Screen>}
      phone={(
        <Phone>
          <PLabel icon="cloud" label="Word cloud" right={<People n={Math.round(24 * clamp(k / 20))} />} />
          <b className="mk-ptitle">One word for this quarter</b>
          <Field empty={sent || k < 2}>{sent ? 'Type a word' : k < 2 ? 'Type a word' : WORD.slice(0, k - 1)}</Field>
          <Btn primary dim={sent || k < 3}>Send</Btn>
          <small className="mk-note num">{sent ? 1 : 0} / 3</small>
        </Phone>
      )}
    />
  );
}

function QuizScene({ k }: { k: number }) {
  /* The leaderboard builds from fifth place up to first. */
  const from = Math.max(0, BOARD.length - Math.floor((k + 1) / 3));
  return (
    <Duo
      screen={<Screen icon="quiz" label="Quiz" count={24}><Panel title={QUIZ.name}><Board rows={BOARD} from={from} /></Panel></Screen>}
      phone={<Phone><PhoneBoard /></Phone>}
    />
  );
}

export function HeroDemo() {
  const [t, setT] = useState(0);
  const [still, setStill] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    if (ref.current) io.observe(ref.current);
    const id = setInterval(() => {
      if (seen && !document.hidden) setT((v) => (v + 1) % (LEN * SCENES.length));
    }, TICK);
    return () => {
      clearInterval(id);
      io.disconnect();
    };
  }, [still]);

  const scene = Math.floor(t / LEN);
  const k = still ? LEN - 1 : t % LEN;
  return (
    <div className="s-stage" ref={ref}>
      <div className="s-frame" key={scene} role="img" aria-label={`${SCENES[scene]}: the big screen and a phone`}>
        {scene === 0 ? <PollScene k={k} /> : scene === 1 ? <QaScene k={k} /> : scene === 2 ? <CloudScene k={k} /> : <QuizScene k={k} />}
      </div>
      <div className="s-scenes" role="tablist" aria-label="What the picture shows">
        {SCENES.map((name, i) => (
          <button key={name} type="button" role="tab" aria-selected={scene === i} onClick={() => setT(i * LEN)}>
            {name}
            <i aria-hidden><b style={{ width: scene === i ? `${((k + 1) / LEN) * 100}%` : '0%' }} /></i>
          </button>
        ))}
      </div>
    </div>
  );
}
