/**
 * The two plans. An account is on Pro until the moment its payments have bought, and on Free
 * otherwise. What each plan holds is in `PLANS` (`limits.ts`); the server checks it wherever a
 * limit applies.
 */
import { PLANS } from './limits';
import type { Account, Store } from './store/types';

export type PlanName = keyof typeof PLANS;
export type Plan = (typeof PLANS)[PlanName];

/** Pro is paid once for a period and does not renew. The periods on sale, and what each costs in rupees. */
export const PRO_OPTIONS = {
  month: { rupees: 79, months: 1, days: 30 },
  year: { rupees: 588, months: 12, days: 365 },
} as const;
export type ProPeriod = keyof typeof PRO_OPTIONS;
export const isPeriod = (v: unknown): v is ProPeriod => v === 'month' || v === 'year';
export const periodLabel = (p: ProPeriod) => (PRO_OPTIONS[p].months === 1 ? '1 month' : `${PRO_OPTIONS[p].months} months`);
/** What a month comes to when a year is bought. */
export const YEAR_PER_MONTH = Math.round(PRO_OPTIONS.year.rupees / PRO_OPTIONS.year.months);

const n = (v: number) => v.toLocaleString('en-US');
/** Each plan in a line, and what Pro adds, as the account and pricing pages list them. */
export const FREE_HOLDS = `Up to ${n(PLANS.free.peoplePerSession)} people and ${PLANS.free.interactionsPerSession} polls and quizzes in a session`;
export const PRO_ADDS = [
  `Up to ${n(PLANS.pro.peoplePerSession)} people in a session`,
  `Up to ${PLANS.pro.interactionsPerSession} polls, quizzes and surveys in a session`,
  'Surveys',
  'Results as CSV and Excel',
];

export const planName = (a: Account | null, now = Date.now()): PlanName => (a && a.proUntil * 1000 > now ? 'pro' : 'free');

/** The plan of the account that owns a session, read when a limit is checked. */
export const planOf = async (db: Store, sub: string): Promise<Plan> => PLANS[planName(await db.getAccount(sub))];
