'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const digits = code.replace(/\D/g, '').slice(0, 6);
  return (
    <main className="narrow stack">
      <div className="spread">
        <strong>LearnBox Sessions</strong>
        <div className="row">
          <a className="btn" href="/sign-in">Sign in</a>
          <a className="btn primary" href="/sign-in?mode=up">Sign up</a>
        </div>
      </div>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (digits.length === 6) router.push(`/s/${digits}`);
        }}
      >
        <label htmlFor="code">Join with a code</label>
        <input id="code" className="code-input num" inputMode="numeric" autoComplete="off" placeholder="123456" value={digits} onChange={(e) => setCode(e.target.value)} />
        <button className="primary" disabled={digits.length !== 6}>Join</button>
      </form>
    </main>
  );
}
