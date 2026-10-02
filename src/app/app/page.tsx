'use client';
/** The facilitator's sessions: the live ones first, each opening its own screen. */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { useSignedIn } from '@/components/use-signed-in';
import { authed, signOut } from '@/lib/auth/client';
import { LIMITS } from '@/lib/limits';
import type { SessionSummary } from '@/lib/store/types';

export default function Dashboard() {
  const email = useSignedIn();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await authed('/api/sessions');
    if (!r.ok) return setErr('Could not load');
    setSessions((await r.json()).sessions);
  }, []);
  useEffect(() => {
    if (email) void load();
  }, [email, load]);

  const create = async () => {
    setBusy(true);
    setErr(null);
    const r = await authed('/api/sessions', { method: 'POST', body: JSON.stringify({ title: 'Untitled session' }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? 'Not created');
    router.push(`/app/sessions/${j.session.id}`);
  };

  if (!email) return null;
  const live = sessions?.filter((s) => s.status === 'live') ?? [];
  const ended = sessions?.filter((s) => s.status !== 'live') ?? [];

  const row = (s: SessionSummary) => (
    <a key={s.id} href={`/app/sessions/${s.id}`} className="card link spread">
      <span className="stack grow" style={{ gap: 2 }}>
        <span className="strong truncate">{s.title}</span>
        <span className="tag num">{new Date(s.createdAt).toLocaleDateString()} · {s.interactions} polls</span>
      </span>
      {s.status === 'live' ? <span className="code-pill num"># {s.code.slice(0, 3)} {s.code.slice(3)}</span> : <span className="tag">Ended</span>}
      {s.status === 'live' && <span className="live-dot">Live</span>}
    </a>
  );

  return (
    <>
      <header className="topbar">
        <a className="wordmark grow" href="/app">LearnBox Sessions</a>
        <span className="muted truncate">{email}</span>
        <a className="btn" href="/app/account">Account</a>
        <button onClick={async () => { await signOut(); router.push('/'); }}>Sign out</button>
      </header>
      <main className="wrap stack" style={{ maxWidth: 760 }}>
        <div className="spread">
          <h1>Sessions</h1>
          <button className="primary" disabled={busy} onClick={create}><Icon name="plus" />New session</button>
        </div>
        {sessions && <span className="tag num">{live.length} / {LIMITS.liveSessionsPerAccount} live · {sessions.length} / {LIMITS.sessionsPerAccount} sessions</span>}
        {err && <p className="error" role="alert">{err}</p>}
        {sessions === null ? <p className="muted">Loading…</p> : (
          <>
            <div className="list">{live.map(row)}</div>
            {ended.length > 0 && <h2 style={{ marginTop: 12 }}>Ended <span className="count num">{ended.length}</span></h2>}
            <div className="list">{ended.map(row)}</div>
          </>
        )}
      </main>
    </>
  );
}
