/** The site's footer: every page of the site, in columns. */
import Link from 'next/link';
import { NAV } from '@/lib/site';

export function SiteFooter() {
  return (
    <footer className="s-foot">
      <div className="s-in">
        <Link className="wordmark" href="/">LearnBox Sessions</Link>
        {NAV.map((g) => (
          <nav key={g.label} aria-label={g.label}>
            <b>{g.label}</b>
            {g.items.map((x) => <Link key={x.href} href={x.href}>{x.label}</Link>)}
          </nav>
        ))}
        <nav aria-label="LearnBox Sessions">
          <b>LearnBox Sessions</b>
          <Link href="/pricing">Pricing</Link>
          <Link href="/sign-in?mode=up">Create account</Link>
          <Link href="/sign-in">Sign in</Link>
          <Link href="/#code">Join a session</Link>
        </nav>
      </div>
    </footer>
  );
}
