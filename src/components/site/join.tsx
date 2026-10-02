'use client';
/** The code field for the audience: six digits, then the phone's screen for that session. */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/icons';

export function JoinBar() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const digits = code.replace(/\D/g, '').slice(0, 6);
  return (
    <div className="s-joinbar">
      <label htmlFor="code">Joining as a participant?</label>
      <form className="join" onSubmit={(e) => { e.preventDefault(); if (digits.length === 6) router.push(`/s/${digits}`); }}>
        <span className="hash" aria-hidden>#</span>
        <input id="code" className="num" inputMode="numeric" autoComplete="off" placeholder="Enter code here" aria-label="Session code" value={digits} onChange={(e) => setCode(e.target.value)} />
        <button className="primary" aria-label="Join" disabled={digits.length !== 6}><Icon name="right" /></button>
      </form>
    </div>
  );
}
