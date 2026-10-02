'use client';
/** A panel over the screen. It closes on its button, on Escape and on a click outside it. On a phone it rises from the bottom. */
import { useEffect, useRef } from 'react';
import { Icon } from './icons';

export function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);
  return (
    <div className="overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={label}>
        <div className="spread">
          <h2>{label}</h2>
          <button type="button" className="icon-btn ghost" aria-label={`Close ${label.toLowerCase()}`} onClick={onClose}><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
