'use client';
/** The phone's identity: one random token per browser, kept so a reload is the same person. */
const TOKEN_KEY = 'la-token';
let memo: string | null = null;

export function browserToken(): string {
  if (memo) return memo;
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t && /^[A-Za-z0-9-]{16,64}$/.test(t)) return (memo = t);
    const n = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, n);
    return (memo = n);
  } catch {
    /* Storage blocked (private mode): this tab is one person until it closes. */
    return (memo ??= crypto.randomUUID());
  }
}

/** How many entries this phone has sent per slide, so a moved-back slide shows as answered. */
export function sentCounts(sessionId: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(`la-sent-${sessionId}`) ?? '{}');
  } catch {
    return {};
  }
}
export function recordSent(sessionId: string, slideId: string, n: number) {
  try {
    const all = sentCounts(sessionId);
    all[slideId] = Math.max(all[slideId] ?? 0, n);
    localStorage.setItem(`la-sent-${sessionId}`, JSON.stringify(all));
  } catch {
    /* fine: the server still refuses duplicates */
  }
}
