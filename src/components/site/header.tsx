'use client';
/**
 * The site's top bar: the name, the menus, and the way in. On a wide screen a menu opens under its
 * button, with a line about the item the pointer is on. On a narrow one the menus open as one page.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { NAV, type NavGroup } from '@/lib/site';

function Drop({ group, open, onOpen, onClose }: { group: NavGroup; open: boolean; onOpen: () => void; onClose: (now?: boolean) => void }) {
  const [cur, setCur] = useState(0);
  const it = group.items[cur];
  return (
    <div className="s-item" onMouseEnter={onOpen} onMouseLeave={() => onClose()}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose(true); }}>
      <button type="button" className="top" aria-expanded={open} aria-haspopup="true" onClick={onOpen}>{group.label}<Icon name="down" /></button>
      {open && (
        <div className="s-dropwrap">
          <div className="s-drop">
            <div className="links">
              {group.items.map((x, i) => (
                <Link key={x.href} href={x.href} className={i === cur ? 'cur' : ''} onMouseEnter={() => setCur(i)} onFocus={() => setCur(i)} onClick={() => onClose(true)}>{x.label}</Link>
              ))}
            </div>
            <div className="about">
              <span className="ic"><Icon name={it.icon} size={24} /></span>
              <b>{it.label}</b>
              <p>{it.text}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nav = useRef<HTMLElement>(null);

  const show = useCallback((label: string) => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(label);
  }, []);
  /* Leaving with the pointer closes after a moment, so crossing the gap to the menu keeps it open. */
  const hide = useCallback((now?: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    if (now) setOpen(null);
    else timer.current = setTimeout(() => setOpen(null), 160);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(null);
      setDrawer(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!nav.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, []);

  /* A new page closes whatever was open. */
  useEffect(() => {
    setOpen(null);
    setDrawer(false);
  }, [path]);

  /* The page behind the open menu stays still. */
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawer]);

  return (
    <header className={`s-head ${scrolled || drawer ? 'scrolled' : ''}`}>
      <div className="s-in">
        <Link className="wordmark" href="/">LearnBox Sessions</Link>
        <nav className="s-nav" aria-label="Site" ref={nav}>
          {NAV.map((g) => <Drop key={g.label} group={g} open={open === g.label} onOpen={() => show(g.label)} onClose={hide} />)}
          <Link className="top" href="/pricing">Pricing</Link>
        </nav>
        <span className="grow" />
        <Link className="btn ghost s-signin" href="/sign-in"><Icon name="user" />Sign in</Link>
        <Link className="btn primary s-signup" href="/sign-in?mode=up">Create account</Link>
        <button type="button" className="icon-btn ghost s-burger" aria-label={drawer ? 'Close menu' : 'Menu'} aria-expanded={drawer} onClick={() => setDrawer((v) => !v)}>
          <Icon name={drawer ? 'x' : 'menu'} size={20} />
        </button>
      </div>
      {drawer && (
        <nav className="s-drawer" aria-label="Site">
          {NAV.map((g) => (
            <details key={g.label}>
              <summary>{g.label}<Icon name="down" /></summary>
              {g.items.map((x) => <Link key={x.href} href={x.href} onClick={() => setDrawer(false)}>{x.label}</Link>)}
            </details>
          ))}
          <Link className="plain" href="/pricing" onClick={() => setDrawer(false)}>Pricing</Link>
          <hr />
          <Link className="btn ghost big" href="/sign-in"><Icon name="user" />Sign in</Link>
          <Link className="btn primary big" href="/sign-in?mode=up">Create account</Link>
        </nav>
      )}
    </header>
  );
}
