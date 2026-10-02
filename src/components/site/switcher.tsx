'use client';
/**
 * A list of items beside one picture: the open item shows its text, and the picture is the open
 * item's. `tabs` lays the items out as a row of tabs over the picture instead.
 */
import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icons';

export interface SwitchItem { icon: IconName; title: string; text: string; href?: string; more?: string; visual: ReactNode }

export function Switcher({ items, tabs }: { items: SwitchItem[]; tabs?: boolean }) {
  const [cur, setCur] = useState(0);
  const id = useId();
  if (tabs) {
    return (
      <div className="s-tabbed">
        <div className="s-tablist" role="tablist">
          {items.map((it, i) => (
            <button key={it.title} type="button" role="tab" id={`${id}-t${i}`} aria-selected={cur === i} aria-controls={`${id}-p`} onClick={() => setCur(i)}><Icon name={it.icon} size={20} />{it.title}</button>
          ))}
        </div>
        <div className="s-split" role="tabpanel" id={`${id}-p`} aria-labelledby={`${id}-t${cur}`}>
          <div className="copy">
            <h3>{items[cur].title}</h3>
            <p>{items[cur].text}</p>
            {items[cur].href && <Link className="s-more" href={items[cur].href}>{items[cur].more ?? 'Learn more'}</Link>}
          </div>
          <div key={cur} className="s-swap">{items[cur].visual}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="s-split flip">
      <div className="s-acc">
        {items.map((it, i) => (
          <div key={it.title} className={cur === i ? 'open' : ''}>
            <button type="button" aria-expanded={cur === i} aria-controls={`${id}-a${i}`} onClick={() => setCur(i)}>
              <Icon name={it.icon} size={24} /><span>{it.title}</span><Icon name={cur === i ? 'up' : 'down'} size={20} />
            </button>
            <div id={`${id}-a${i}`} hidden={cur !== i}>
              <p>{it.text}</p>
              {it.href && <Link className="s-more" href={it.href}>{it.more ?? 'Learn more'}</Link>}
            </div>
          </div>
        ))}
      </div>
      <div key={cur} className="s-swap">{items[cur].visual}</div>
    </div>
  );
}
