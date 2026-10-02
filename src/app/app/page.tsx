'use client';
/** The facilitator's sessions, newest first: filter, search, open, duplicate, delete. */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { Menu } from '@/components/menu';
import { useSignedIn } from '@/components/use-signed-in';
import { authed, signOut } from '@/lib/auth/client';
import { LIMITS } from '@/lib/limits';
import type { SessionSummary } from '@/lib/store/types';

type Filter = 'all' | 'live' | 'ended';

export default function Dashboard() {
  const email = useSignedIn();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const r = await authed('/api/sessions');
    if (!r.ok) return setErr('Could not load');
    setSessions((await r.json()).sessions);
  }, []);
  useEffect(() => {
    if (email) void load();
  }, [email, load]);

  /** Makes a session, new or as a copy of another, and opens it. */
  const create = async (from?: string) => {
    setBusy(true);
    setErr(null);
    const r = await authed('/api/sessions', { method: 'POST', body: JSON.stringify(from ? { from } : { title: 'Untitled session' }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? 'Not created');
    router.push(`/app/sessions/${j.session.id}`);
  };
  const remove = async (s: SessionSummary) => {
    if (!confirm(`Delete "${s.title}"? Its results are deleted with it.`)) return;
    setErr(null);
    const r = await authed(`/api/sessions/${s.id}`, { method: 'DELETE' });
    if (!r.ok) setErr('Not deleted');
    await load();
  };

  if (!email) return null;
  const isLive = (s: SessionSummary) => s.status === 'live';
  const live = sessions?.filter(isLive) ?? [];
  const counts: Record<Filter, number> = { all: sessions?.length ?? 0, live: live.length, ended: (sessions?.length ?? 0) - live.length };
  const q = query.trim().toLowerCase();
  const shown = (sessions ?? [])
    .filter((s) => filter === 'all' || (filter === 'live') === isLive(s))
    .filter((s) => !q || s.title.toLowerCase().includes(q) || s.code.includes(q.replace(/\s/g, '')));

  return (
    <div className="apppage">
      <header className="apphead">
        <a className="wordmark grow" href="/app">LearnBox Sessions</a>
        <span className="muted truncate wide-only">{email}</span>
        <a className="btn" href="/app/account">Account</a>
        <button onClick={async () => { await signOut(); router.push('/'); }}>Sign out</button>
      </header>
      <main className="wrap stack" style={{ maxWidth: 1077, gap: 16 }}>
        <div className="spread">
          <h1>Sessions</h1>
          <button className="primary tall" disabled={busy} onClick={() => create()}><Icon name="plus" />New session</button>
        </div>
        <div className="spread" style={{ flexWrap: 'wrap' }}>
          <div className="chips" role="group" aria-label="Show">
            {(['all', 'live', 'ended'] as Filter[]).map((f) => (
              <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'live' ? 'Live' : 'Ended'} <span className="count num">{counts[f]}</span></button>
            ))}
          </div>
          {sessions && <span className="tag num">{live.length} / {LIMITS.liveSessionsPerAccount} live · {sessions.length} / {LIMITS.sessionsPerAccount} sessions</span>}
        </div>
        <div className="search">
          <Icon name="search" />
          <input type="search" aria-label="Search sessions" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {err && <p className="error" role="alert">{err}</p>}
        {sessions === null ? !err && <p className="muted">Loading…</p> : (
          <div className="srows">
            {shown.map((s) => (
              <div key={s.id} className="srow">
                <a className="main" href={`/app/sessions/${s.id}`}>
                  <span className="row" style={{ flexWrap: 'nowrap' }}><span className="strong truncate">{s.title}</span>{isLive(s) && <span className="faint num" style={{ flex: 'none' }}># {s.code.slice(0, 3)} {s.code.slice(3)}</span>}</span>
                  <span className="tag num">{new Date(s.createdAt).toLocaleDateString()} · {s.interactions} polls</span>
                </a>
                {isLive(s) ? <span className="live-dot">Live</span> : <span className="tag">Ended</span>}
                <button className="icon-btn ghost" aria-label={`Duplicate ${s.title}`} title="Duplicate" disabled={busy} onClick={() => create(s.id)}><Icon name="copy" /></button>
                <Menu label={`More for ${s.title}`} className="icon-btn ghost" trigger={<Icon name="morev" />}>
                  <a className="btn" href={`/app/sessions/${s.id}/results`}><Icon name="trend" />Results</a>
                  <button className="danger" onClick={() => remove(s)}><Icon name="trash" />Delete</button>
                </Menu>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
