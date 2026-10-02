/** The front page: the code field for the audience, what the product does, and the way in for facilitators. */
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { Cta, SIGN_UP, Steps, Works } from '@/components/site/blocks';
import { HeroDemo } from '@/components/site/hero-demo';
import { JoinBar } from '@/components/site/join';
import { Switcher } from '@/components/site/switcher';
import { TryIt } from '@/components/site/try-it';
import { Visual } from '@/components/site/visuals';
import { LIMITS } from '@/lib/limits';
import { feature, inSentence } from '@/lib/site';

/* Draft copy, kept to plain statements; the owner edits the wording. */
const AREAS = (['polls', 'qa', 'quizzes', 'surveys', 'results'] as const).map((slug) => {
  const f = feature(slug)!;
  return { icon: f.icon, title: f.nav, text: f.lead, href: `/features/${f.slug}`, more: `More about ${inSentence(f)}`, visual: <Visual name={slug === 'polls' ? 'rating' : f.visual} /> };
});

export default function Home() {
  return (
    <>
      <JoinBar />

      <section className="s-hero">
        <div className="s-in">
          <h1>Live polls, Q&A, quizzes and surveys</h1>
          <p className="s-lead">Free. Your audience joins on their phones with a 6-digit code.</p>
          <div className="s-actions">
            <Link className="btn primary big" href={SIGN_UP}>Create free account</Link>
            <Link className="s-more" href="/product">Product tour</Link>
          </div>
          <HeroDemo />
        </div>
      </section>

      <Works />

      <section className="s-sec">
        <div className="s-in">
          <div className="s-intro">
            <h2>What a session holds</h2>
            <p className="s-lead">The Q&A is open for the whole session. Polls, quizzes and surveys start one at a time.</p>
          </div>
          <Switcher items={AREAS} />
        </div>
      </section>

      <section className="s-sec tight">
        <div className="s-in">
          <ul className="s-cards">
            <li><Icon name="phone" size={40} /><h3>No app, no account</h3><p>The audience joins in a browser with the code or the QR code.</p></li>
            <li><Icon name="list" size={40} /><h3>5 poll types, quizzes and surveys</h3><p>Multiple choice, word cloud, rating, open text and ranking, beside the Q&A.</p></li>
            <li><Icon name="users" size={40} /><h3>Free</h3><p>Up to {LIMITS.peoplePerSession.toLocaleString('en-US')} people in a session. <Link href="/pricing">What is included</Link></p></li>
          </ul>
        </div>
      </section>

      <Steps band title="A session in 3 steps" steps={[
        { title: '1. Create a session', text: 'Add your polls, quizzes and surveys. The Q&A is already there.', art: 'add' },
        { title: '2. Share the code', text: 'Put the big screen on the projector or share it in your call.', art: 'code' },
        { title: '3. Start', text: 'Start a poll, or take questions. The screen updates as people answer.', art: 'bars' },
      ]} />

      <section className="s-sec">
        <div className="s-in">
          <div className="s-intro">
            <h2>Try it</h2>
            <p className="s-lead">Vote on the phone. The big screen follows.</p>
          </div>
          <TryIt kind="poll" />
        </div>
      </section>

      <Cta title="Create your first session" />
    </>
  );
}
