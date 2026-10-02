'use client';
/** The front page: the code field for the audience, and the way in for facilitators. */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon, TYPE_ICON, type IconName } from '@/components/icons';

/* Draft copy, kept to plain statements; the owner edits the wording. */
const FEATURES: [IconName, string, string][] = [
  ['chat', 'Q&A', 'The audience asks and upvotes questions for the whole session. You review, reply, highlight and mark them answered.'],
  [TYPE_ICON.choice, 'Multiple choice', 'People pick one or more options. The bars update as votes arrive.'],
  [TYPE_ICON.wordcloud, 'Word cloud', 'Each person sends up to 3 words. Repeated words grow.'],
  [TYPE_ICON.rating, 'Rating', 'A scale of up to 10. The screen shows the average and the spread.'],
  [TYPE_ICON.open, 'Open text', 'Short written answers, shown as a wall.'],
  [TYPE_ICON.ranking, 'Ranking', 'People put the options in order. The screen shows the combined order.'],
  [TYPE_ICON.quiz, 'Quiz', 'Timed questions. Points for correct and fast answers, and a leaderboard.'],
  [TYPE_ICON.survey, 'Survey', 'Several questions on one page, answered at each person’s own pace.'],
];

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const digits = code.replace(/\D/g, '').slice(0, 6);
  return (
    <>
      <header className="topbar" style={{ position: 'static', borderBottom: 0 }}>
        <a className="wordmark grow" href="/">LearnBox Sessions</a>
        <a className="btn ghost" href="/sign-in">Sign in</a>
        <a className="btn primary" href="/sign-in?mode=up">Create account</a>
      </header>

      <main>
        <section className="hero">
          <form className="join" onSubmit={(e) => { e.preventDefault(); if (digits.length === 6) router.push(`/s/${digits}`); }}>
            <span className="hash" aria-hidden>#</span>
            <input id="code" className="num" inputMode="numeric" autoComplete="off" placeholder="Enter code here" aria-label="Session code" value={digits} onChange={(e) => setCode(e.target.value)} />
            <button className="primary" aria-label="Join" disabled={digits.length !== 6}><Icon name="right" /></button>
          </form>
          <h1>Live polls, Q&A, quizzes and surveys</h1>
          <p>Free. Your audience joins on their phones with a 6-digit code.</p>
          <a className="btn primary" href="/sign-in?mode=up">Create free account</a>
        </section>

        <section className="features" aria-label="What a session can hold">
          {FEATURES.map(([icon, name, line]) => (
            <div key={name} className="card">
              <span className="kind"><Icon name={icon} size={20} /></span>
              <h2>{name}</h2>
              <p className="muted">{line}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="footer"><span className="wordmark">LearnBox Sessions</span></footer>
    </>
  );
}
