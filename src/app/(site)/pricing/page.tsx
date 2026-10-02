/** The two plans, then what each holds line by line. The numbers are in `src/lib/limits.ts`, the price in `src/lib/plans.ts`. */
import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { Cta } from '@/components/site/blocks';
import { PRO_PRICE } from '@/lib/plans';
import { COMPARE, PLAN_CARDS } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Pricing · LearnBox Sessions',
  description: 'LearnBox Sessions has two plans, Free and Pro. What each includes.',
};

function Cell({ value, plan }: { value: string | boolean; plan: string }) {
  if (value === true) return <td><Icon name="check" size={20} /><span className="s-sr">{plan}: included</span></td>;
  if (value === false) return <td className="none"><span aria-hidden>–</span><span className="s-sr">{plan}: not included</span></td>;
  return <td className="num">{value}</td>;
}

export default function Pricing() {
  return (
    <>
      <section className="s-top center">
        <div className="s-in">
          <h1>Pricing</h1>
          <p className="s-lead num">Free, or Pro at ₹{PRO_PRICE.rupeesPerMonth} a month.</p>
          <div className="s-plans">
            {PLAN_CARDS.map((p) => (
              <div key={p.name} className={`s-plan ${p.pro ? 'pro' : ''}`}>
                <div className="price">
                  <h2>{p.name}</h2>
                  <p><b className="num">{p.price}</b><span>{p.per}</span></p>
                  <small className="num">{p.note}</small>
                </div>
                <Link className={`btn big ${p.pro ? 'primary' : ''}`} href={p.href}>{p.action}</Link>
                <div className="has">
                  <span>{p.intro}</span>
                  <ul>
                    {p.lines.map((line) => <li key={line}><Icon name="check" size={20} /><span className="num">{line}</span></li>)}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="s-sec s-band">
        <div className="s-in">
          <h2 className="s-center">Compare plans</h2>
          <div className="s-compare">
            <table>
              <thead>
                <tr><td /><th scope="col">Free</th><th scope="col">Pro</th></tr>
              </thead>
              {COMPARE.map((g) => (
                <tbody key={g.title}>
                  <tr className="group"><th scope="colgroup" colSpan={3}>{g.title}</th></tr>
                  {g.rows.map((r) => (
                    <tr key={r.label}>
                      <th scope="row">{r.label}</th>
                      <Cell value={r.free} plan="Free" />
                      <Cell value={r.pro} plan="Pro" />
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </div>
      </section>
      <Cta title="Create your first session" />
    </>
  );
}
