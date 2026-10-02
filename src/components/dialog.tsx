'use client';
/**
 * What opens over a screen: a dialog in the middle (a sheet from the bottom on a phone), a
 * question to confirm, a panel down the right side, and a short note that goes by itself.
 */
import { useEffect, useRef } from 'react';
import { Icon } from './icons';

function useEscape(onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);
}

/** A panel over the screen. It closes on its button, on Escape and on a click outside it. On a phone it rises from the bottom. */
export function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEscape(onClose);
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

export interface Ask { title: string; text: string; action: string; danger?: boolean; run: () => void }

/** A question before something that is hard to undo: what will happen, Cancel, and the action by its name. */
export function Confirm({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog confirm" role="alertdialog" aria-modal="true" aria-label={ask.title}>
        <h2>{ask.title}</h2>
        <p>{ask.text}</p>
        <div className="row end">
          <button type="button" className="ghost tall" onClick={onClose}>Cancel</button>
          <button type="button" className={`tall ${ask.danger ? 'solid-danger' : 'primary'}`} autoFocus onClick={() => { onClose(); ask.run(); }}>{ask.action}</button>
        </div>
      </div>
    </div>
  );
}

/** A panel down the right side of the facilitator's screen; the rest of the screen stays in use. `foot` stays at its bottom. */
export function Panel({ label, onClose, children, foot }: { label: string; onClose: () => void; children: React.ReactNode; foot?: React.ReactNode }) {
  useEscape(onClose);
  return (
    <aside className="sidepanel" aria-label={label}>
      <div className="spread">
        <h2>{label}</h2>
        <button type="button" className="ghost" aria-label="Close panel" onClick={onClose}>Close<Icon name="x" /></button>
      </div>
      <div className="body">{children}</div>
      {foot && <div className="foot">{foot}</div>}
    </aside>
  );
}

/** A short note at the bottom of the screen. It goes after a few seconds. */
export function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), 2500);
    return () => clearTimeout(t);
  }, [text]);
  return <div className="toast" role="status"><Icon name="check" />{text}</div>;
}
