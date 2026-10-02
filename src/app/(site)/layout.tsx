/** The site: the front page and the pages about the product, under one top bar and footer. */
import { SiteFooter } from '@/components/site/footer';
import { SiteHeader } from '@/components/site/header';
import './site.css';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
