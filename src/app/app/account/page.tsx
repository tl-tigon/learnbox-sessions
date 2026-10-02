'use client';
/** The facilitator's account: the email, the plan and paying for Pro, a password change, and deleting the account with all its data. */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { authed, changePassword, DEV_AUTH, removeSignIn } from '@/lib/auth/client';
import { useSignedIn } from '@/components/use-signed-in';
import { FREE_HOLDS, PRO_ADDS, PRO_PRICE, PRO_RUPEES } from '@/lib/plans';

const PASSWORD_RULE = /^(?=.*\d).{8,}$/;

interface PlanInfo { plan: 'free' | 'pro'; proUntil: number | null; payments: boolean }
const PRICE = `₹${PRO_RUPEES} for ${PRO_PRICE.months} months`;
/* What the payment page sent the browser back with. */
const OUTCOME: Record<string, { ok: boolean; text: string }> = {
  paid: { ok: true, text: 'Payment received' },
  pending: { ok: true, text: 'Payment is being confirmed. Reload this page in a minute.' },
  failed: { ok: false, text: 'Payment not completed' },
};

export default function Account() {
  const email = useSignedIn();
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<PlanInfo | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);

  useEffect(() => {
    if (!email) return;
    authed('/api/account').then(async (r) => { if (r.ok) setInfo(await r.json()); }).catch(() => {});
  }, [email]);
  /* Coming back from the payment page: the outcome is in the address, and is taken out of it so a reload does not show it again. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('payment');
    if (!p) return;
    setOutcome(p);
    window.history.replaceState(null, '', '/app/account');
  }, []);
  /* Back from the payment page without paying: the browser restores this page as it was left, with Pay switched off. */
  useEffect(() => {
    const back = (e: PageTransitionEvent) => { if (e.persisted) setPaying(false); };
    window.addEventListener('pageshow', back);
    return () => window.removeEventListener('pageshow', back);
  }, []);

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

  /* The server writes the order and signs the form; the browser posts it to the payment page and leaves. */
  const pay = async () => {
    setPaying(true);
    setPayErr(null);
    try {
      const r = await authed('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ name, phone }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'Not started');
      const form = Object.assign(document.createElement('form'), { method: 'post', action: j.action });
      for (const [k, v] of Object.entries(j.fields as Record<string, string>)) form.append(Object.assign(document.createElement('input'), { type: 'hidden', name: k, value: v }));
      document.body.append(form);
      form.submit();
    } catch (e) {
      setPayErr(e instanceof Error ? e.message : 'Not started');
      setPaying(false);
    }
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

  const pro = info?.plan === 'pro';
  const shown = outcome ? OUTCOME[outcome] : undefined;

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

      <section className="card stack" id="plan">
        <div className="spread"><h2>Plan</h2>{info && <span className="pill-pro">{pro ? 'Pro' : 'Free'}</span>}</div>
        {shown && <p className={shown.ok ? 'strong' : 'error'} role={shown.ok ? 'status' : 'alert'}>{shown.text}</p>}
        {info && (pro
          ? <p className="num">Pro until {new Date(info.proUntil! * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          : <p className="muted num">{FREE_HOLDS}</p>)}
        {info && !pro && (
          <>
            <h3 className="num">Pro · {PRICE}</h3>
            <ul className="ticks num">{PRO_ADDS.map((line) => <li key={line}><Icon name="check" />{line}</li>)}</ul>
          </>
        )}
        {info && !info.payments && <p className="muted">Payments are not set up</p>}
        {info?.payments && pro && !adding && <div className="row"><button className="num" onClick={() => setAdding(true)}>Add {PRO_PRICE.months} months · ₹{PRO_RUPEES}</button></div>}
        {info?.payments && (!pro || adding) && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void pay(); }}>
            <label>Name<input value={name} maxLength={60} autoComplete="name" disabled={paying} onChange={(e) => setName(e.target.value)} /></label>
            <label>Mobile number<input type="tel" inputMode="tel" value={phone} maxLength={20} autoComplete="tel" disabled={paying} onChange={(e) => setPhone(e.target.value)} /></label>
            <div className="row">
              <button type="submit" className="primary tall num" disabled={paying || !name.trim() || !phone.trim()}>Pay ₹{PRO_RUPEES}</button>
              {payErr && <span className="error" role="alert">{payErr}</span>}
            </div>
            <p className="muted small num">Paid once on PayU for {PRO_PRICE.months} months. It does not renew.</p>
          </form>
        )}
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
            <p>Delete this account? Its sessions and all their answers are removed.{pro && ' Its Pro plan ends.'}</p>
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
