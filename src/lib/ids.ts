import { randomBytes, randomInt } from 'node:crypto';

/** A sortable, unguessable id: time first so lists sort by creation, then 80 random bits. */
export function newId(): string {
  return Date.now().toString(36).padStart(9, '0') + randomBytes(10).toString('hex');
}

/** The 6-digit join code. Digits only, because people read it off a screen and type it on a phone. */
export function newCode(): string {
  return String(randomInt(100000, 1000000));
}

/** A long random secret, for display keys. */
export function newSecret(): string {
  return randomBytes(24).toString('base64url');
}

export const isCode = (s: string) => /^\d{6}$/.test(s);
/** Browser tokens are made on the phone (crypto.randomUUID); anything else is refused. */
export const isToken = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(s);
