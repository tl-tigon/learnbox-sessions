'use client';
/** A button that opens a short list of actions. It closes on a choice, a click elsewhere or Escape. */
import { useEffect, useRef, useState } from 'react';

export function Menu({ label, className = '', trigger, left, children }: {
  /** The button's name for screen readers. */
  label: string;
  className?: string;
  /** What the button shows. */
  trigger: React.ReactNode;
  /** Opens to the right of the button's left edge; by default the list hangs from its right edge. */
  left?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button type="button" className={className} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((x) => !x)}>{trigger}</button>
      {open && <div className={`items ${left ? 'left' : ''}`} role="menu" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}
