/** One part of the product, on its own page. What it says is in `src/lib/site.ts`. */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Cta, More, Row, SIGN_UP, Steps, Works } from '@/components/site/blocks';
import { TryIt } from '@/components/site/try-it';
import { Visual } from '@/components/site/visuals';
import { feature, FEATURES } from '@/lib/site';

export const dynamicParams = false;
export const generateStaticParams = () => FEATURES.map((f) => ({ slug: f.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const f = feature((await params).slug);
  return f ? { title: `${f.title} · LearnBox Sessions`, description: f.lead } : {};
}

export default async function Feature({ params }: { params: Promise<{ slug: string }> }) {
  const f = feature((await params).slug);
  if (!f) notFound();
  /* Tinted and plain sections alternate down the page. */
  const moreBand = (f.rows.length % 2 === 0) === !!f.demo;
  return (
    <>
      <section className="s-top">
        <div className="s-in s-split">
          <div className="copy">
            <h1>{f.title}</h1>
            <p className="s-lead">{f.lead}</p>
            <ul className="s-points">{f.points.map((p) => <li key={p}>{p}</li>)}</ul>
            <div className="s-actions">
              <Link className="btn primary big" href={SIGN_UP}>Create free account</Link>
              <a className="s-more" href="#how">How it works</a>
            </div>
          </div>
          <Visual name={f.visual} />
        </div>
      </section>

      <div id="how"><Steps band title="How it works" steps={f.steps} /></div>

      {f.demo && (
        <section className="s-sec">
          <div className="s-in">
            <div className="s-intro">
              <h2>Try it</h2>
              <p className="s-lead">{f.demo === 'poll' ? 'Vote on the phone. The big screen follows.' : 'Upvote a question or send one. The big screen follows.'}</p>
            </div>
            <TryIt kind={f.demo} />
          </div>
        </section>
      )}

      {f.rows.map((r, i) => (
        <Row key={r.label} label={r.label} title={r.title} visual={r.visual} flip={i % 2 === 1} band={(i % 2 === 0) === !!f.demo}>
          <p className="s-lead">{r.text}</p>
        </Row>
      ))}

      <More title="More" items={f.more} band={moreBand} />
      <Works band={!moreBand} />
      <Cta title={f.closing} />
    </>
  );
}
