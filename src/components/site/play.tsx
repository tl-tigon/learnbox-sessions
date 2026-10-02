'use client';
/**
 * A picture that plays when it is scrolled to. It starts with the class `wait`, which the styles
 * read as bars empty and rows out; once a third of it is in view the class goes and they move in.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Play({ className, label, children }: { className: string; label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [wait, setWait] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setWait(false);
      return;
    }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      setWait(false);
      io.disconnect();
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`${className} s-play ${wait ? 'wait' : ''}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>{children}</div>;
}
