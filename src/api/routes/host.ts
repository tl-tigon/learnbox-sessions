/** The facilitator's routes, behind a sign-in. */
import type { Route } from '../routes';
import * as account from '../account';
import * as session from '../session';
import * as sessionQa from '../session-qa';
import * as sessionResults from '../session-results';
import * as sessions from '../sessions';

export const HOST: Route[] = [
  { path: '/api/sessions', group: 'host', handlers: sessions },
  { path: '/api/sessions/{id}', group: 'host', handlers: session },
  { path: '/api/sessions/{id}/qa/{qid}', group: 'host', handlers: sessionQa },
  { path: '/api/sessions/{id}/results', group: 'host', handlers: sessionResults },
  { path: '/api/account', group: 'host', handlers: account },
];
