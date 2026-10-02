/** Where the product is used, each with what to run there. */
import type { Metadata } from 'next';
import Link from 'next/link';
import { Cta, Row, SIGN_UP } from '@/components/site/blocks';
import { Icon } from '@/components/icons';
import { USE_CASES } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Use cases · LearnBox Sessions',
  description: 'LearnBox Sessions in training sessions, team meetings, all-hands meetings, events and classrooms.',
};

export default function UseCases() {
  return (
    <>
      <section className="s-top center">
        <div className="s-in">
          <h1>Use cases</h1>
          <p className="s-lead">One session works the same in a room, on a call, or both.</p>
          <ul className="s-jump">
            {USE_CASES.map((u) => <li key={u.id}><a href={`#${u.id}`}><Icon name={u.icon} size={20} />{u.nav}</a></li>)}
          </ul>
        </div>
      </section>

      {USE_CASES.map((u, i) => (
        <Row key={u.id} id={u.id} title={u.title} visual={u.visual} flip={i % 2 === 1} band={i % 2 === 0}>
          <ul className="s-points">{u.points.map((p) => <li key={p}>{p}</li>)}</ul>
          <Link className="btn primary big" href={SIGN_UP}>Create free account</Link>
        </Row>
      ))}

      <Cta title="Create your first session" />
    </>
  );
}
