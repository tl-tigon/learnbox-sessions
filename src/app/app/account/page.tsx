'use client';
/** The facilitator's account: the email, a password change, and deleting the account with all its data. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { authed, changePassword, DEV_AUTH, removeSignIn } from '@/lib/auth/client';
import { useSignedIn } from '@/components/use-signed-in';

const PASSWORD_RULE = /^(?=.*\d).{8,}$/;

export default function Account() {
  const email = useSignedIn();
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!email) return null;

  const change = async () => {
    if (!PASSWORD_RULE.test(next)) return setNote({ ok: false, text: '8 or more characters, with a number' });
    setBusy(true);
    setNote(null);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setNote({ ok: true, text: 'Password changed' });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : 'Not changed' });
    }
    setBusy(false);
  };

  /* The data goes first, while the sign-in still proves whose it is; then the sign-in itself. */
  const remove = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await authed('/api/account', { method: 'DELETE' });
      if (!r.ok) throw new Error('Not deleted');
      await removeSignIn();
      router.push('/');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not deleted');
      setBusy(false);
    }
  };

  return (
    <div className="apppage">
    <header className="apphead">
      <a className="btn round" href="/app" aria-label="All sessions"><Icon name="left" /></a>
      <h1 className="headtitle">Account</h1>
    </header>
    <main className="wrap stack" style={{ maxWidth: 560 }}>
      <section className="card stack">
        <label>Email<input value={email} readOnly /></label>
      </section>

      {!DEV_AUTH && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); void change(); }}>
          <h2>Change password</h2>
          <label>Current password<input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
          <label>New password<input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
          <div className="row">
            <button type="submit" disabled={busy || !current || !next}>Change password</button>
            {note && <span className={note.ok ? 'muted' : 'error'} role="status">{note.text}</span>}
          </div>
        </form>
      )}

      <section className="card stack">
        <h2>Delete account</h2>
        {confirming ? (
          <>
            <p>Delete this account? Its sessions and all their answers are removed.</p>
            <div className="row">
              <button className="danger" disabled={busy} onClick={remove}>Delete account</button>
              <button disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <div className="row"><button className="danger" onClick={() => setConfirming(true)}>Delete account</button></div>
        )}
        {err && <p className="error" role="alert">{err}</p>}
      </section>
    </main>
    </div>
  );
}
