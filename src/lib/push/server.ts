/**
 * Publishing live updates through AppSync Events.
 *
 * Only the server publishes, signed with its AWS role; browsers can only subscribe. When the
 * Events API is not configured, publishing does nothing and every screen falls back to polling,
 * so the product works without it, only less instantly.
 *
 * A failed publish is logged and swallowed: the answer is already stored and the next poll or
 * publish carries it, so a push hiccup must never fail the person's request.
 */
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import type { PushEvent } from './events';

const HOST = process.env.NEXT_PUBLIC_EVENTS_HTTP_DOMAIN;
const REGION = process.env.AWS_REGION ?? 'ap-south-1';

let signer: SignatureV4 | null = null;
const getSigner = () =>
  (signer ??= new SignatureV4({ service: 'appsync', region: REGION, credentials: defaultProvider(), sha256: Sha256 }));

export const pushEnabled = () => !!HOST && process.env.PUSH_OFF !== '1';

export async function publish(channel: string, event: PushEvent): Promise<void> {
  if (!pushEnabled()) return;
  try {
    const body = JSON.stringify({ channel, events: [JSON.stringify(event)] });
    const req = new HttpRequest({
      method: 'POST',
      protocol: 'https:',
      hostname: HOST!,
      path: '/event',
      headers: { 'content-type': 'application/json', host: HOST! },
      body,
    });
    const signed = await getSigner().sign(req);
    const res = await fetch(`https://${HOST}/event`, { method: 'POST', headers: signed.headers as Record<string, string>, body });
    if (!res.ok) console.warn('push failed', res.status, await res.text().catch(() => ''));
  } catch (e) {
    console.warn('push failed', e);
  }
}
