'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authed, signOut } from '@/lib/auth/client';
import { useSignedIn } from '@/components/use-signed-in';
import type { PresentationSummary, SessionSummary } from '@/lib/store/types';

export default function Dashboard() {
  const email = useSignedIn();
  const router = useRouter();
  const [pres, setPres] = useState<PresentationSummary[] | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([authed('/api/presentations'), authed('/api/sessions')]);
    if (!p.ok || !s.ok) return setErr('Could not load');
    setPres((await p.json()).presentations);
    setSessions((await s.json()).sessions);
  }, []);
  useEffect(() => {
    if (email) void load();
  }, [email, load]);

  const create = async () => {
    const r = await authed('/api/presentations', { method: 'POST', body: JSON.stringify({ title: 'Untitled' }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    router.push(`/app/p/${j.presentation.id}`);
  };

  if (!email) return null;
  return (
    <main className="wrap stack">
      <div className="spread">
        <strong>LearnBox Sessions</strong>
        <div className="row small">
          <span className="muted">{email}</span>
          <button onClick={async () => { await signOut(); router.push('/'); }}>Sign out</button>
        </div>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <section className="stack">
        <div className="spread"><h2>Presentations</h2><button className="primary" onClick={create}>New presentation</button></div>
        {pres === null ? <p className="muted">Loading…</p> : !pres.length ? null : (
          <div className="list">
            {pres.map((p) => (
              <a key={p.id} href={`/app/p/${p.id}`} className="card spread" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span>{p.title}</span>
                <span className="muted small num">{p.slideCount} slides · {new Date(p.updatedAt).toLocaleDateString()}</span>
              </a>
            ))}
          </div>
        )}
      </section>
      {sessions.length > 0 && (
        <section className="stack">
          <h2>Sessions</h2>
          <div className="list">
            {sessions.map((s) => (
              <div key={s.id} className="card spread">
                <span>{s.title} <span className="muted small num">· {s.code} · {new Date(s.createdAt).toLocaleString()}</span></span>
                <span className="row">
                  {s.status === 'live' && <a className="btn" href={`/control/${s.id}`}>Control</a>}
                  {s.status === 'live' && <a className="btn" href={`/present/${s.id}`} target="_blank" rel="noreferrer">Screen</a>}
                  <a className="btn" href={`/app/sessions/${s.id}`}>Results</a>
                  <span className={s.status === 'live' ? 'small' : 'muted small'}>{s.status === 'live' ? 'Live' : 'Ended'}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
