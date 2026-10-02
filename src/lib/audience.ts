'use client';
/** The phone's identity: one random token per browser, kept so a reload is the same person. */
const TOKEN_KEY = 'la-token';
let memo: string | null = null;

/** `crypto.randomUUID` exists only on secure pages; a phone on a plain http address in testing gets the same kind of token another way. */
function newToken(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function browserToken(): string {
  if (memo) return memo;
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t && /^[A-Za-z0-9-]{16,64}$/.test(t)) return (memo = t);
    const n = newToken();
    localStorage.setItem(TOKEN_KEY, n);
    return (memo = n);
  } catch {
    /* Storage blocked (private mode): this tab is one person until it closes. */
    return (memo ??= newToken());
  }
}

/** The name this person last gave, offered again the next time one is asked for. */
const NAME_KEY = 'la-name';
export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
export function saveName(name: string) {
  try {
    if (name.trim()) localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    /* fine: the name is asked for again next time */
  }
}
