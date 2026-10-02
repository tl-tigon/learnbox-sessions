/** Sections the site's pages share. */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';
import type { ArtName, VisualName } from '@/lib/site';
import { Art, Visual } from './visuals';

export const SIGN_UP = '/sign-in?mode=up';

/** The band at the foot of a page: one heading, one button. */
export function Cta({ title }: { title: string }) {
  return (
    <section className="s-cta">
      <div className="s-in">
        <h2>{title}</h2>
        <Link className="btn big" href={SIGN_UP}>Create free account</Link>
      </div>
    </section>
  );
}

const WHERE: [IconName, string, string][] = [
  ['screen', 'Projector or TV', 'Open the big screen in a browser.'],
  ['share', 'Zoom, Teams, Meet, Webex', 'Share the big screen’s browser tab.'],
  ['phone', 'Phones and laptops', 'The audience joins in a browser.'],
  ['copy', 'Code and QR code', 'Both show on the big screen.'],
];

/** Where a session runs: in a room and on a call. */
export function Works({ title = 'Works in a room and on any video call', band = true }: { title?: string; band?: boolean }) {
  return (
    <section className={`s-works ${band ? 's-band' : ''}`}>
      <div className="s-in">
        <h2>{title}</h2>
        <ul>
          {WHERE.map(([icon, name, line]) => (
            <li key={name}><span className="ic"><Icon name={icon} size={28} /></span><b>{name}</b><span>{line}</span></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Steps({ title, steps, band }: { title: string; steps: { title: string; text: string; art: ArtName }[]; band?: boolean }) {
  return (
    <section className={`s-sec ${band ? 's-band' : ''}`}>
      <div className="s-in">
        <h2 className="s-center">{title}</h2>
        <ol className="s-steps">
          {steps.map((s) => (
            <li key={s.title}><Art name={s.art} /><h3>{s.title}</h3><p>{s.text}</p></li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function More({ title, items, band }: { title: string; items: { icon: IconName; title: string; text: string }[]; band?: boolean }) {
  return (
    <section className={`s-sec ${band ? 's-band' : ''}`}>
      <div className="s-in">
        <h2 className="s-center">{title}</h2>
        <ul className="s-more-grid">
          {items.map((m) => (
            <li key={m.title}><Icon name={m.icon} size={32} /><h3>{m.title}</h3><p>{m.text}</p></li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Text on one side, a picture on the other. `flip` puts the picture first. */
export function Row({ id, label, title, visual, flip, band, children }: {
  id?: string; label?: string; title: string; visual: VisualName; flip?: boolean; band?: boolean; children: ReactNode;
}) {
  return (
    <section id={id} className={`s-sec ${band ? 's-band' : ''}`}>
      <div className={`s-in s-split ${flip ? 'flip' : ''}`}>
        <div className="copy">
          {label && <span className="s-eyebrow">{label}</span>}
          <h2>{title}</h2>
          {children}
        </div>
        <Visual name={visual} />
      </div>
    </section>
  );
}
