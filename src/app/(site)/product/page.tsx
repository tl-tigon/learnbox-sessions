/** The product tour: each part of a session, with a link to its own page. */
import type { Metadata } from 'next';
import Link from 'next/link';
import { TYPE_ICON } from '@/components/icons';
import { Cta, More, Row, SIGN_UP, Works } from '@/components/site/blocks';
import { Switcher } from '@/components/site/switcher';
import { Visual } from '@/components/site/visuals';
import { feature, inSentence } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Product tour · LearnBox Sessions',
  description: 'Live polls, Q&A, quizzes, surveys and results in LearnBox Sessions.',
};

/* Draft copy, kept to plain statements; the owner edits the wording. */
const polls = feature('polls')!;
const TYPES = polls.rows.map((r, i) => ({
  icon: TYPE_ICON[(['choice', 'wordcloud', 'rating', 'open', 'ranking'] as const)[i]], title: r.label, text: `${r.title}. ${r.text}`, visual: <Visual name={r.visual} />,
}));

const TOUR = (['qa', 'quizzes', 'surveys', 'results'] as const).map((slug) => feature(slug)!);

export default function Product() {
  return (
    <>
      <section className="s-top">
        <div className="s-in s-split">
          <div className="copy">
            <h1>Product tour</h1>
            <p className="s-lead">A session has a code, a Q&A that is open throughout, and the polls, quizzes and surveys you start one at a time.</p>
            <div className="s-actions">
              <Link className="btn primary big" href={SIGN_UP}>Create free account</Link>
              <Link className="s-more" href="/pricing">What is included</Link>
            </div>
          </div>
          <Visual name="join" />
        </div>
      </section>

      <section className="s-sec s-band" id="polls">
        <div className="s-in">
          <div className="s-intro">
            <span className="s-eyebrow">Live polls</span>
            <h2>{polls.tour}</h2>
            <p className="s-lead">{polls.lead}</p>
            <Link className="s-more" href="/features/polls">More about live polls</Link>
          </div>
          <Switcher tabs items={TYPES} />
        </div>
      </section>

      {TOUR.map((f, i) => (
        <Row key={f.slug} id={f.slug} label={f.nav} title={f.tour} visual={f.visual} flip={i % 2 === 0} band={i % 2 === 1}>
          <p className="s-lead">{f.lead}</p>
          <ul className="s-points">{f.points.map((p) => <li key={p}>{p}</li>)}</ul>
          <Link className="s-more" href={`/features/${f.slug}`}>More about {inSentence(f)}</Link>
        </Row>
      ))}

      <Works band={TOUR.length % 2 === 1} />

      <More band={TOUR.length % 2 === 0} title="On the facilitator’s screen" items={[
        { icon: 'list', title: 'Edit while live', text: 'Add or change polls, quizzes and surveys while the session runs. Changes save as you type.' },
        { icon: 'play', title: 'One at a time', text: 'Start a poll, quiz or survey and it opens on every phone. Stop it and the phones go back to the Q&A.' },
        { icon: 'eyeoff', title: 'Hide results, close voting', text: 'Keep results back until you are ready, or stop new answers.' },
        { icon: 'screen', title: 'The big screen', text: 'Open it from the Present button, or on another computer with its own link.' },
        { icon: 'copy', title: 'Duplicate', text: 'Copy a session with all its polls to run it again.' },
        { icon: 'download', title: 'Results', text: 'One page per session. On Pro, downloads as CSV or Excel.' },
      ]} />

      <Cta title="Create your first session" />
    </>
  );
}
