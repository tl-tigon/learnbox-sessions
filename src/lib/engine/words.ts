/**
 * Text from the audience: normalising words for the cloud, and a basic profanity check.
 *
 * The word list is small and English-only on purpose. It catches the common cases on a projector;
 * the moderation queue (Q&A) is the real safeguard for anything subtler.
 */

const BLOCKED = [
  'fuck', 'shit', 'cunt', 'bitch', 'bastard', 'dick', 'cock', 'pussy', 'asshole', 'arsehole',
  'motherfucker', 'slut', 'whore', 'fag', 'faggot', 'nigger', 'nigga', 'retard', 'wanker',
  'bollocks', 'twat', 'chutiya', 'madarchod', 'behenchod', 'bhenchod', 'bhosdike', 'gaand', 'randi',
];

/* Letters people swap in to dodge a filter. */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

function squash(s: string): string {
  return s
    .toLowerCase()
    .replace(/[013457@$!]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, '');
}

export function isProfane(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/).map(squash).filter(Boolean);
  const whole = squash(text);
  return BLOCKED.some((b) => words.some((w) => w === b || w.startsWith(b)) || (b.length >= 5 && whole.includes(b)));
}

/**
 * One cloud entry: trimmed, single-spaced, lower case, without surrounding punctuation, so
 * "Trust", "trust." and " TRUST " land on the same word.
 */
export function normaliseWord(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** Free text kept as written, with whitespace tidied and control characters removed. */
export function cleanText(raw: string): string {
  return raw.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}
