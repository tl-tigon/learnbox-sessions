/** What the product costs and what that includes. The numbers are the fair-use limits in `src/lib/limits.ts`. */
import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { Cta, SIGN_UP } from '@/components/site/blocks';
import { INCLUDED } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Pricing · LearnBox Sessions',
  description: 'LearnBox Sessions is free. What a free account includes.',
};

export default function Pricing() {
  return (
    <>
      <section className="s-top center">
        <div className="s-in">
          <h1>Pricing</h1>
          <p className="s-lead">LearnBox Sessions is free.</p>
          <div className="s-plan">
            <div className="price"><b>Free</b><span>One plan, for every account</span></div>
            <ul>
              {INCLUDED.map((line) => <li key={line}><Icon name="check" size={20} /><span className="num">{line}</span></li>)}
            </ul>
            <Link className="btn primary big" href={SIGN_UP}>Create free account</Link>
          </div>
        </div>
      </section>
      <Cta title="Create your first session" />
    </>
  );
}
