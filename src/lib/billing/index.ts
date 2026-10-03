/**
 * Paying for Pro. An order is written before the buyer leaves for the payment page, and the
 * account becomes Pro only when PayU's signed outcome for that order says it was paid, for the
 * amount the order was made for. The order is settled once, however the news arrives: the
 * buyer's browser coming back, or this server asking PayU.
 */
import { randomBytes } from 'node:crypto';
import { devAuth, type User } from '../auth/server';
import { cleanText } from '../engine/words';
import { LiveError } from '../live';
import { isPeriod, periodLabel, planName, PRO_OPTIONS } from '../plans';
import type { Order, Store } from '../store/types';
import { lookUp, requestHash, signedByPayu, type PayuRequest } from './payu';

export interface Gateway {
  key: string;
  salt: string;
  /** Where the browser posts the signed form. */
  payUrl: string;
  /** Where this server asks about a transaction; none for the development stand-in. */
  verifyUrl: string | null;
  dev: boolean;
}

/** Local path of the stand-in for PayU's payment page, used in development when no PayU keys are set. */
export const DEV_GATEWAY = '/api/billing/dev-gateway';

/**
 * PayU when its key and salt are set (its test site unless PAYU_ENV=live). In development with
 * no keys, or with PAYU_ENV=standin, a stand-in page on this server that signs as PayU does.
 * Otherwise payments are off.
 */
export function gateway(): Gateway | null {
  const key = process.env.PAYU_KEY, salt = process.env.PAYU_SALT;
  if (key && salt && !(process.env.PAYU_ENV === 'standin' && devAuth())) {
    const live = process.env.PAYU_ENV === 'live';
    return {
      key, salt, dev: false,
      payUrl: live ? 'https://secure.payu.in/_payment' : 'https://test.payu.in/_payment',
      verifyUrl: live ? 'https://info.payu.in/merchant/postservice?form=2' : 'https://test.payu.in/merchant/postservice?form=2',
    };
  }
  if (devAuth()) return { key: 'dev', salt: 'dev-salt', dev: true, payUrl: DEV_GATEWAY, verifyUrl: null };
  return null;
}

/** The site's address, where the buyer's browser is sent after paying: SITE_URL in production, where the pages live apart from the API. */
export const siteOrigin = (req: Request) => (process.env.SITE_URL || new URL(req.url).origin).replace(/\/$/, '');
/** This API's own address, where PayU posts the signed outcome. */
export const apiOrigin = (req: Request) => new URL(req.url).origin;

/** PayU takes a transaction id of up to 25 letters and digits. */
const newTxn = () => Date.now().toString(36).padStart(9, '0') + randomBytes(8).toString('hex');

/** What the account page shows: the plan, when Pro ends, and whether Pro can be bought here. */
export async function accountView(db: Store, sub: string) {
  const account = await db.getAccount(sub);
  const plan = planName(account);
  return { plan, proUntil: plan === 'pro' ? account!.proUntil : null, payments: !!gateway() };
}

/**
 * Writes a pending order for the period chosen and returns the form the browser posts to the
 * payment page. The amount comes from the period, never from the browser. PayU needs the buyer's
 * name and mobile number; the number goes to PayU and is not kept here.
 */
export async function startOrder(db: Store, user: User, raw: Record<string, unknown>, origin: string): Promise<{ action: string; fields: Record<string, string> }> {
  const g = gateway();
  if (!g) throw new LiveError(503, 'Payments are not set up');
  if (!isPeriod(raw.period)) throw new LiveError(400, 'Choose 1 month or 12 months');
  const option = PRO_OPTIONS[raw.period];
  const firstname = cleanText(typeof raw.name === 'string' ? raw.name : '').replace(/[^A-Za-z .]/g, '').trim().slice(0, 60);
  /* The name is part of what is signed, so it is kept to characters PayU passes through unchanged. */
  if (!firstname) throw new LiveError(400, 'Enter your name in English letters');
  const phone = (typeof raw.phone === 'string' ? raw.phone : '').replace(/[\s()+-]/g, '');
  if (!/^\d{10,15}$/.test(phone)) throw new LiveError(400, 'Enter a mobile number');
  const hour = Date.now() - 3600_000;
  if ((await db.listOrders(user.sub)).filter((o) => Date.parse(o.createdAt) > hour).length >= 10) throw new LiveError(429, 'Too many tries. Wait an hour.');

  const order: Order = { id: newTxn(), sub: user.sub, amount: option.rupees.toFixed(2), days: option.days, status: 'pending', createdAt: new Date().toISOString() };
  await db.addOrder(order);
  const back = `${origin}/api/billing/return`;
  const request: PayuRequest = { key: g.key, txnid: order.id, amount: order.amount, productinfo: `LearnBox Sessions Pro ${periodLabel(raw.period)}`, firstname, email: user.email, phone, surl: back, furl: back, udf1: user.sub };
  return { action: g.payUrl, fields: { ...request, hash: requestHash(request, g.salt) } };
}

export type Outcome = 'paid' | 'failed' | 'pending';

/**
 * Takes the outcome PayU posted back. Nothing is believed unless it is signed, names an order of
 * the account it carries, and is for that order's amount.
 */
export async function finishOrder(db: Store, posted: Record<string, string>): Promise<Outcome> {
  const g = gateway();
  if (!g || posted.key !== g.key || !signedByPayu(posted, g.salt)) return 'failed';
  const order = await db.getOrder(posted.udf1 ?? '', posted.txnid ?? '');
  if (!order) return 'failed';
  if (posted.status === 'success') {
    if (Number(posted.amount) !== Number(order.amount)) return 'failed';
    await db.settleOrder(order.sub, order.id, posted.mihpayid ?? '');
    return 'paid';
  }
  if (posted.status === 'failure') {
    await db.failOrder(order.sub, order.id);
    return order.status === 'paid' ? 'paid' : 'failed';
  }
  return order.status === 'paid' ? 'paid' : 'pending';
}

/**
 * Asks PayU about the account's recent orders that are still pending, and settles the ones that
 * were paid. Run when the account page loads, so a buyer who paid and closed the payment page
 * still gets Pro. A failed call changes nothing and the order stays pending.
 */
export async function reconcile(db: Store, sub: string, send: typeof fetch = fetch): Promise<void> {
  const g = gateway();
  if (!g?.verifyUrl) return;
  const day = Date.now() - 86400_000;
  const pending = (await db.listOrders(sub)).filter((o) => o.status === 'pending' && Date.parse(o.createdAt) > day).slice(0, 3);
  for (const o of pending) {
    try {
      const found = await lookUp(g.verifyUrl, g.key, g.salt, o.id, send);
      if (found.status === 'success' && Number(found.amount) === Number(o.amount)) await db.settleOrder(sub, o.id, found.ref);
      else if (found.status === 'failure') await db.failOrder(sub, o.id);
    } catch {
      /* PayU could not be reached; the next load asks again. */
    }
  }
}
