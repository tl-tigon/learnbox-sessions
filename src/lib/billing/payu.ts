/**
 * PayU's hosted checkout, as its documentation describes it (docs.payu.in): the browser posts a
 * signed form to PayU, the buyer pays on PayU's page, and PayU posts the signed outcome back.
 * Both signatures are SHA-512 over the fields joined with "|", with the merchant's salt.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const sha512 = (s: string) => createHash('sha512').update(s).digest('hex');

export interface PayuRequest {
  key: string; txnid: string; amount: string; productinfo: string; firstname: string; email: string; phone: string;
  surl: string; furl: string; udf1: string;
}

/** key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT */
export const requestHash = (f: Pick<PayuRequest, 'key' | 'txnid' | 'amount' | 'productinfo' | 'firstname' | 'email' | 'udf1'>, salt: string) =>
  sha512([f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, f.udf1, '', '', '', '', '', '', '', '', '', salt].join('|'));

/**
 * SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key, with
 * "additionalCharges|" in front when PayU added charges.
 */
export function responseHash(p: Record<string, string>, salt: string): string {
  const v = (k: string) => p[k] ?? '';
  const base = [salt, v('status'), '', '', '', '', '', v('udf5'), v('udf4'), v('udf3'), v('udf2'), v('udf1'), v('email'), v('firstname'), v('productinfo'), v('amount'), v('txnid'), v('key')].join('|');
  return sha512(v('additionalCharges') ? `${v('additionalCharges')}|${base}` : base);
}

/** True if the posted outcome carries the signature only PayU and this server can make. */
export function signedByPayu(p: Record<string, string>, salt: string): boolean {
  const got = Buffer.from((p.hash ?? '').toLowerCase());
  const want = Buffer.from(responseHash(p, salt));
  return got.length === want.length && timingSafeEqual(got, want);
}

export interface Lookup { status: 'success' | 'failure' | 'unknown'; amount: string; ref: string }

/**
 * Asks PayU what became of a transaction (its verify_payment command), for a payment whose
 * outcome never reached this server: the buyer paid and closed the page before coming back.
 */
export async function lookUp(url: string, key: string, salt: string, txnid: string, send: typeof fetch = fetch): Promise<Lookup> {
  const command = 'verify_payment';
  const body = new URLSearchParams({ key, command, var1: txnid, hash: sha512([key, command, txnid, salt].join('|')) });
  const r = await send(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body, cache: 'no-store' });
  if (!r.ok) return { status: 'unknown', amount: '', ref: '' };
  const j = (await r.json().catch(() => null)) as { transaction_details?: Record<string, { status?: string; amt?: string; transaction_amount?: string; mihpayid?: string }> } | null;
  const t = j?.transaction_details?.[txnid];
  const status = t?.status === 'success' ? 'success' : t?.status === 'failure' ? 'failure' : 'unknown';
  /* `transaction_amount` is what the order asked for; `amt` is that plus any charges PayU added for the buyer. */
  return { status, amount: String(t?.transaction_amount ?? t?.amt ?? ''), ref: String(t?.mihpayid ?? '') };
}
