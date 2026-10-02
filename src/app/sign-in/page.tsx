'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  DEV_AUTH, confirmForgot, devSignIn, emailConfirm, emailResend, emailSignIn, emailSignUp, forgotPassword, googleAvailable, googleSignIn,
} from '@/lib/auth/client';

type Mode = 'in' | 'up' | 'confirm' | 'forgot' | 'reset';

export default function SignInPage() {
  return <Suspense><SignIn /></Suspense>;
}

function SignIn() {
  const router = useRouter();
  const q = useSearchParams();
  const [mode, setMode] = useState<Mode>(q.get('mode') === 'up' ? 'up' : 'in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (DEV_AUTH) {
    return (
      <main className="narrow stack">
        <h1>Sign in</h1>
        <p className="muted small">Development sign-in: any email, no password.</p>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await devSignIn(email); router.push('/app'); }); }}>
          <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <button className="primary" disabled={busy}>Continue</button>
        </form>
        {err && <p className="error small" role="alert">{err}</p>}
      </main>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (mode === 'in') {
        const r = await emailSignIn(email, password);
        if (r.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
          await emailResend(email);
          setMode('confirm');
          setNote('Enter the code sent to your email');
          return;
        }
        router.push('/app');
      } else if (mode === 'up') {
        await emailSignUp(email, password);
        setMode('confirm');
        setNote('Enter the code sent to your email');
      } else if (mode === 'confirm') {
        await emailConfirm(email, code);
        await emailSignIn(email, password);
        router.push('/app');
      } else if (mode === 'forgot') {
        await forgotPassword(email);
        setMode('reset');
        setNote('Enter the code sent to your email and a new password');
      } else if (mode === 'reset') {
        await confirmForgot(email, code, password);
        setMode('in');
        setNote('Password changed. Sign in.');
      }
    });
  };

  const heading = { in: 'Sign in', up: 'Create account', confirm: 'Confirm email', forgot: 'Reset password', reset: 'Reset password' }[mode];
  const button = { in: 'Sign in', up: 'Create account', confirm: 'Confirm', forgot: 'Send code', reset: 'Change password' }[mode];

  return (
    <main className="narrow stack">
      <h1>{heading}</h1>
      {googleAvailable() && (mode === 'in' || mode === 'up') && (
        <>
          <button type="button" onClick={() => run(googleSignIn)} disabled={busy}>Continue with Google</button>
          <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>or</p>
        </>
      )}
      <form className="stack" onSubmit={submit}>
        <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        {(mode === 'confirm' || mode === 'reset') && (
          <label>Code<input inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" /></label>
        )}
        {mode !== 'forgot' && mode !== 'confirm' && (
          <label>{mode === 'reset' ? 'New password' : 'Password'}
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
          </label>
        )}
        {(mode === 'up' || mode === 'reset') && <p className="muted small" style={{ margin: 0 }}>8 or more characters, with a number</p>}
        <button className="primary" disabled={busy}>{button}</button>
      </form>
      {note && <p className="small">{note}</p>}
      {err && <p className="error small" role="alert">{err}</p>}
      <div className="row small">
        {mode !== 'in' && <button type="button" onClick={() => setMode('in')}>Sign in</button>}
        {mode !== 'up' && <button type="button" onClick={() => setMode('up')}>Create account</button>}
        {mode === 'in' && <button type="button" onClick={() => setMode('forgot')}>Forgot password</button>}
        {mode === 'confirm' && <button type="button" onClick={() => run(async () => { await emailResend(email); setNote('Code sent'); })}>Resend code</button>}
      </div>
    </main>
  );
}
