/**
 * One call to Claude through the Anthropic Messages API. The key and the model come from the
 * environment and never leave the server. With no key, development uses a stand-in that answers
 * from the data it is given, so the screens can be worked on and walked; production with no key
 * has the AI features off.
 */
import { devAuth } from '../auth/server';

export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const API = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 25_000;

/** US dollars per million tokens, in and out, by model prefix. Used only to estimate cost in the usage record. */
const PRICES: [prefix: string, input: number, output: number][] = [
  ['claude-haiku-4-5', 1, 5],
  ['claude-sonnet-4-5', 3, 15],
  ['claude-opus-4', 15, 75],
];

export interface Completion { text: string; model: string; inputTokens: number; outputTokens: number; costUsd: number }

export class AiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const FAILED = 'LearnBox couldn\'t generate this right now. Try again.';

/** The model in use, or null when the AI features are off (no key, outside development). */
export function aiModel(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  return devAuth() ? 'standin' : null;
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES.find(([p]) => model.startsWith(p));
  if (!price) return 0;
  return Math.round(((inputTokens * price[1] + outputTokens * price[2]) / 1e6) * 1e6) / 1e6;
}

/**
 * Asks the model and returns its text. `standIn` makes the development answer when there is no
 * key; `fail` (development only) makes that answer fail, so the screens' failure path can be walked.
 */
export async function complete(system: string, user: string, maxTokens: number, standIn: () => string, fail = false): Promise<Completion> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    if (!devAuth()) throw new AiError(503, 'AI is not set up');
    if (fail) throw new AiError(502, FAILED);
    const text = standIn();
    return { text, model: 'standin', inputTokens: Math.ceil((system.length + user.length) / 4), outputTokens: Math.ceil(text.length / 4), costUsd: 0 };
  }
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      signal: ctl.signal,
    });
    if (!r.ok) {
      console.error('anthropic', r.status, (await r.text()).slice(0, 300));
      throw new AiError(502, FAILED);
    }
    const j = (await r.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; model?: string };
    const text = (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    const inputTokens = j.usage?.input_tokens ?? 0;
    const outputTokens = j.usage?.output_tokens ?? 0;
    return { text, model: j.model ?? model, inputTokens, outputTokens, costUsd: estimateCost(j.model ?? model, inputTokens, outputTokens) };
  } catch (e) {
    if (e instanceof AiError) throw e;
    console.error('anthropic', e instanceof Error ? e.message : e);
    throw new AiError(502, FAILED);
  } finally {
    clearTimeout(timer);
  }
}

/** The JSON object in the model's answer, which may come wrapped in prose or a code fence. */
export function jsonIn(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
