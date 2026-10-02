import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from '../store/memory';
import { deleteAccountData } from '../account';
import { accountView, finishOrder, gateway, reconcile, startOrder } from '../billing';
import { requestHash, responseHash } from '../billing/payu';
import { control, createSession, duplicateSession, editSession, joinSession } from '../live';
import { PLANS } from '../limits';
import { planName, planOf } from '../plans';
import type { Store } from '../store/types';
import { INTERACTIONS, makePro, running, TOKEN } from './helpers';

const DAY = 86400_000;
const polls = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `poll${String(i).padStart(4, '0')}`, type: 'rating', title: `Poll ${i + 1}`, max: 5 }));
const SURVEY = INTERACTIONS.find((i) => i.type === 'survey')!;
const refusal = async (run: Promise<unknown>) => run.then(() => null, (e: { status?: number; message: string }) => `${e.status}: ${e.message}`);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('the Free plan', () => {
  it('holds 10 polls and quizzes in a session and refuses the 11th', async () => {
    const db = memoryStore();
    const s = await createSession(db, 'free1', 'Free');
    const ten = await editSession(db, s, { interactions: polls(10) });
    expect(ten.interactions).toHaveLength(10);
    expect(await refusal(editSession(db, ten, { interactions: polls(11) }))).toBe('402: Up to 10 polls and quizzes in a session on Free');
    expect((await db.getSession(s.id))!.interactions).toHaveLength(10);
  });

  it('refuses a survey, however it is sent', async () => {
    const db = memoryStore();
    const s = await createSession(db, 'free1', 'Free');
    expect(await refusal(editSession(db, s, { interactions: [SURVEY] }))).toBe('402: Surveys are on Pro');
    expect(await refusal(editSession(db, s, { interactions: [...polls(2), { ...SURVEY, id: 'poll0000' }] }))).toBe('402: Surveys are on Pro');
    expect((await db.getSession(s.id))!.interactions).toHaveLength(0);
  });

  it('holds 200 people in a session; Pro holds 1,000', async () => {
    const db = memoryStore();
    const s = await createSession(db, 'free1', 'Free');
    for (let i = 1; i <= 200; i++) expect((await joinSession(db, s, TOKEN(i), '')).full).toBe(false);
    expect((await joinSession(db, s, TOKEN(201), '')).full).toBe(true);
    /* Someone already in is found again, not counted again. */
    expect((await joinSession(db, s, TOKEN(7), '')).full).toBe(false);
    await makePro(db, 'free1');
    expect((await joinSession(db, s, TOKEN(201), '')).full).toBe(false);
    expect((await planOf(db, 'free1')).peoplePerSession).toBe(1000);
  });

  it('has no downloads; Pro has', async () => {
    const db = memoryStore();
    expect((await planOf(db, 'free1')).downloads).toBe(false);
    await makePro(db, 'free1');
    expect((await planOf(db, 'free1')).downloads).toBe(true);
  });
});

describe('when Pro ends', () => {
  async function lapsed() {
    const db = memoryStore();
    await makePro(db, 'u1', 1);
    const made = await createSession(db, 'u1', 'Made on Pro');
    const s = await editSession(db, made, { interactions: [...polls(12), SURVEY] });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2 * DAY);
    return { db, s };
  }

  it('the account is on Free again', async () => {
    const { db } = await lapsed();
    expect(planName(await db.getAccount('u1'))).toBe('free');
  });

  it('a session keeps what it holds and can be edited, and takes no more', async () => {
    const { db, s } = await lapsed();
    const renamed = s.interactions.map((i, n) => (n === 0 ? { ...i, title: 'Renamed' } : i));
    const saved = await editSession(db, s, { interactions: renamed });
    expect(saved.interactions).toHaveLength(13);
    expect(saved.interactions[0].title).toBe('Renamed');
    expect(await refusal(editSession(db, saved, { interactions: [...saved.interactions, ...polls(14).slice(13)] }))).toMatch(/^402/);
    expect(await refusal(editSession(db, saved, { interactions: [...saved.interactions.slice(0, 5), { ...SURVEY, id: 'surveynew' }] }))).toBe('402: Surveys are on Pro');
    const fewer = await editSession(db, saved, { interactions: saved.interactions.slice(0, 12) });
    expect(fewer.interactions).toHaveLength(12);
  });

  it('its survey does not start, and the session cannot be copied', async () => {
    const { db, s } = await lapsed();
    expect(await refusal(control(db, s, { action: 'activate', id: SURVEY.id }))).toBe('402: Surveys are on Pro');
    expect((await control(db, s, { action: 'activate', id: 'poll0000' })).state.active).toBe('poll0000');
    expect(await refusal(duplicateSession(db, 'u1', s))).toBe('402: A copy of this session needs Pro');
  });
});

describe('paying for Pro', () => {
  const USER = { sub: 'buyer-1', email: 'buyer@example.com' };
  const ORIGIN = 'https://sessions.example';
  beforeEach(() => {
    vi.stubEnv('PAYU_KEY', 'testkey');
    vi.stubEnv('PAYU_SALT', 'testsalt');
  });

  /** What PayU posts back for an order, signed with the salt. */
  function outcome(fields: Record<string, string>, status: string, change: Record<string, string> = {}) {
    const back: Record<string, string> = {
      mihpayid: '403993715524045752', status, key: fields.key, txnid: fields.txnid, amount: fields.amount, productinfo: fields.productinfo,
      firstname: fields.firstname, email: fields.email, udf1: fields.udf1,
    };
    back.hash = responseHash(back, 'testsalt');
    return { ...back, ...change };
  }
  const start = (db: Store, period = 'year') => startOrder(db, USER, { name: 'Asha Rao', phone: '98765 43210', period }, ORIGIN);

  it('signs the request and the outcome as PayU documents them', () => {
    const sha = (s: string) => createHash('sha512').update(s).digest('hex');
    const f = { key: 'k', txnid: 't', amount: '588.00', productinfo: 'p', firstname: 'f', email: 'e', udf1: 'u' };
    expect(requestHash(f, 's')).toBe(sha(`k|t|588.00|p|f|e|u${'|'.repeat(10)}s`));
    expect(responseHash({ ...f, status: 'success' }, 's')).toBe(sha(`s|success${'|'.repeat(10)}u|e|f|p|588.00|t|k`));
    expect(responseHash({ ...f, status: 'success', additionalCharges: '11.80' }, 's')).toBe(sha(`11.80|s|success${'|'.repeat(10)}u|e|f|p|588.00|t|k`));
  });

  it('uses PayU\'s test site unless told it is live', () => {
    expect(gateway()!.payUrl).toBe('https://test.payu.in/_payment');
    vi.stubEnv('PAYU_ENV', 'live');
    expect(gateway()!.payUrl).toBe('https://secure.payu.in/_payment');
    /* The stand-in page can be asked for with keys set, in development only. */
    vi.stubEnv('PAYU_ENV', 'standin');
    expect(gateway()!.dev).toBe(false);
    vi.stubEnv('AUTH_MODE', 'dev');
    expect(gateway()).toMatchObject({ dev: true, key: 'dev', payUrl: '/api/billing/dev-gateway' });
  });

  it('writes a pending order and a signed form for 588.00', async () => {
    const db = memoryStore();
    const { action, fields } = await start(db);
    expect(action).toBe('https://test.payu.in/_payment');
    expect(fields).toMatchObject({ key: 'testkey', amount: '588.00', firstname: 'Asha Rao', email: 'buyer@example.com', phone: '9876543210', udf1: 'buyer-1', surl: `${ORIGIN}/api/billing/return`, furl: `${ORIGIN}/api/billing/return` });
    expect(fields.txnid).toMatch(/^[a-z0-9]{25}$/);
    expect(fields.hash).toBe(requestHash(fields as never, 'testsalt'));
    expect(await db.listOrders('buyer-1')).toMatchObject([{ id: fields.txnid, status: 'pending', amount: '588.00', days: 365 }]);
    expect((await accountView(db, 'buyer-1')).plan).toBe('free');
  });

  it('one month costs 79.00 and gives 30 days; the amount is set by the period, not by the browser', async () => {
    const db = memoryStore();
    const { fields } = await startOrder(db, USER, { name: 'Asha Rao', phone: '9876543210', period: 'month', amount: '1.00', days: 9999 }, ORIGIN);
    expect(fields).toMatchObject({ amount: '79.00', productinfo: 'LearnBox Sessions Pro 1 month' });
    expect(await finishOrder(db, outcome(fields, 'success'))).toBe('paid');
    expect(Math.round(((await db.getAccount('buyer-1'))!.proUntil * 1000 - Date.now()) / DAY)).toBe(30);
    /* A month's payment reported as if it were for the year's order gives nothing more. */
    const year = await start(db);
    expect(await finishOrder(db, outcome({ ...year.fields, amount: '79.00' }, 'success'))).toBe('failed');
    expect(Math.round(((await db.getAccount('buyer-1'))!.proUntil * 1000 - Date.now()) / DAY)).toBe(30);
    expect(await refusal(startOrder(db, USER, { name: 'Asha Rao', phone: '9876543210', period: 'decade' }, ORIGIN))).toBe('400: Choose 1 month or 12 months');
    expect(await refusal(startOrder(db, USER, { name: 'Asha Rao', phone: '9876543210' }, ORIGIN))).toBe('400: Choose 1 month or 12 months');
  });

  it('asks for a name and a mobile number', async () => {
    const db = memoryStore();
    expect(await refusal(startOrder(db, USER, { name: '', phone: '9876543210', period: 'year' }, ORIGIN))).toBe('400: Enter your name in English letters');
    expect(await refusal(startOrder(db, USER, { name: 'Asha', phone: '12345', period: 'year' }, ORIGIN))).toBe('400: Enter a mobile number');
    expect(await db.listOrders('buyer-1')).toEqual([]);
  });

  it('a paid order gives 365 days of Pro, once, however many times it is reported', async () => {
    const db = memoryStore();
    const { fields } = await start(db);
    const paid = outcome(fields, 'success');
    expect(await finishOrder(db, paid)).toBe('paid');
    const first = (await db.getAccount('buyer-1'))!.proUntil;
    expect(Math.round((first * 1000 - Date.now()) / DAY)).toBe(365);
    expect(await finishOrder(db, paid)).toBe('paid');
    expect(await db.settleOrder('buyer-1', fields.txnid, 'again')).toBeNull();
    expect((await db.getAccount('buyer-1'))!.proUntil).toBe(first);
    expect(await accountView(db, 'buyer-1')).toMatchObject({ plan: 'pro', proUntil: first });
    expect(await db.listOrders('buyer-1')).toMatchObject([{ status: 'paid', ref: '403993715524045752' }]);
  });

  it('a second payment adds a year to the end of the first', async () => {
    const db = memoryStore();
    expect(await finishOrder(db, outcome((await start(db)).fields, 'success'))).toBe('paid');
    const first = (await db.getAccount('buyer-1'))!.proUntil;
    expect(await finishOrder(db, outcome((await start(db)).fields, 'success'))).toBe('paid');
    expect((await db.getAccount('buyer-1'))!.proUntil).toBe(first + 365 * 86400);
  });

  it('believes nothing that is not signed for this order, this account and this amount', async () => {
    const db = memoryStore();
    const { fields } = await start(db);
    const other = await startOrder(db, { sub: 'someone-else', email: 'x@example.com' }, { name: 'X', phone: '9876543210', period: 'year' }, ORIGIN);
    const tries = [
      outcome(fields, 'failure', { status: 'success' }),
      outcome(fields, 'success', { amount: '1.00' }),
      outcome(fields, 'success', { hash: 'f'.repeat(128) }),
      outcome(fields, 'success', { hash: '' }),
      outcome(fields, 'success', { udf1: 'someone-else' }),
      outcome(fields, 'success', { txnid: other.fields.txnid }),
      outcome(fields, 'success', { key: 'otherkey' }),
      outcome({ ...fields, amount: '1.00' }, 'success'),
      outcome({ ...fields, txnid: 'no-such-order' }, 'success'),
    ];
    for (const t of tries) expect(await finishOrder(db, t)).toBe('failed');
    expect(await db.getAccount('buyer-1')).toBeNull();
    expect(await db.getAccount('someone-else')).toBeNull();
    expect((await db.getOrder('buyer-1', fields.txnid))!.status).toBe('pending');
  });

  it('a failed payment gives nothing; the same order paid on a retry gives Pro', async () => {
    const db = memoryStore();
    const { fields } = await start(db);
    expect(await finishOrder(db, outcome(fields, 'failure'))).toBe('failed');
    expect((await db.getOrder('buyer-1', fields.txnid))!.status).toBe('failed');
    expect(await db.getAccount('buyer-1')).toBeNull();
    expect(await finishOrder(db, outcome(fields, 'pending'))).toBe('pending');
    expect(await finishOrder(db, outcome(fields, 'success'))).toBe('paid');
    expect(planName(await db.getAccount('buyer-1'))).toBe('pro');
  });

  it('a payment whose outcome never came back is found by asking PayU', async () => {
    const db = memoryStore();
    const { fields } = await start(db);
    const asked: string[] = [];
    const answer = (details: Record<string, string>) => (async (url: RequestInfo | URL, init?: RequestInit) => {
      asked.push(`${url} ${String(init?.body)}`);
      return new Response(JSON.stringify({ status: 1, msg: '1 out of 1 Transactions Fetched Successfully', transaction_details: { [fields.txnid]: details } }));
    }) as typeof fetch;

    await reconcile(db, 'buyer-1', answer({ mihpayid: 'Not Found', status: 'Not Found' }));
    await reconcile(db, 'buyer-1', answer({ mihpayid: '77', status: 'success', amt: '1.00' }));
    await reconcile(db, 'buyer-1', (async () => { throw new Error('offline'); }) as typeof fetch);
    expect(await db.getAccount('buyer-1')).toBeNull();
    expect(asked[0]).toContain('https://test.payu.in/merchant/postservice?form=2');
    expect(asked[0]).toContain(`command=verify_payment&var1=${fields.txnid}`);

    /* As PayU's test site answers when it has added charges for the buyer: `amt` is the total, `transaction_amount` the order's. */
    await reconcile(db, 'buyer-1', answer({ mihpayid: '77', status: 'success', amt: '588.00', transaction_amount: '1.00' }));
    expect(await db.getAccount('buyer-1')).toBeNull();
    await reconcile(db, 'buyer-1', answer({ mihpayid: '613345778913325568', status: 'success', unmappedstatus: 'captured', amt: '624.24', transaction_amount: '588.00', additional_charges: '36.24' }));
    expect(planName(await db.getAccount('buyer-1'))).toBe('pro');
    const until = (await db.getAccount('buyer-1'))!.proUntil;
    const before = asked.length;
    await reconcile(db, 'buyer-1', answer({ mihpayid: '77', status: 'success', amt: '588.00' }));
    expect(asked).toHaveLength(before);
    expect((await db.getAccount('buyer-1'))!.proUntil).toBe(until);
  });

  it('is off when no keys are set outside development', async () => {
    vi.stubEnv('PAYU_KEY', '');
    vi.stubEnv('PAYU_SALT', '');
    vi.stubEnv('AUTH_MODE', '');
    const db = memoryStore();
    expect(gateway()).toBeNull();
    expect(await refusal(start(db))).toBe('503: Payments are not set up');
    expect((await accountView(db, 'buyer-1')).payments).toBe(false);
  });

  it('deleting the account removes its plan and orders', async () => {
    const { db } = await running(1, 'buyer-1');
    await start(db);
    await deleteAccountData(db, 'buyer-1');
    expect(await db.getAccount('buyer-1')).toBeNull();
    expect(await db.listOrders('buyer-1')).toEqual([]);
    expect((await planOf(db, 'buyer-1'))).toBe(PLANS.free);
  });
});
