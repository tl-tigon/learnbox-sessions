/** Payments: the only code that sees the PayU salt. */
import type { Route } from '../routes';
import * as billingCheckout from '../billing-checkout';
import * as billingDevGateway from '../billing-dev-gateway';
import * as billingReturn from '../billing-return';

export const BILLING: Route[] = [
  { path: '/api/billing/checkout', group: 'billing', handlers: billingCheckout },
  { path: '/api/billing/return', group: 'billing', handlers: billingReturn },
  { path: '/api/billing/dev-gateway', group: 'billing', handlers: billingDevGateway },
];
