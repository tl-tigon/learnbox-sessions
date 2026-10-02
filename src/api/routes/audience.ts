/** What phones call: open to anyone, and the busiest group. */
import type { Route } from '../routes';
import * as join from '../join';
import * as joinPage from '../join-page';
import * as live from '../live';
import * as liveAnswer from '../live-answer';
import * as liveQa from '../live-qa';
import * as liveQaVote from '../live-qa-vote';
import * as liveQaWithdraw from '../live-qa-withdraw';

export const AUDIENCE: Route[] = [
  { path: '/api/join/{code}', group: 'audience', handlers: join },
  { path: '/j/{code}', group: 'audience', handlers: joinPage },
  { path: '/api/live/{id}', group: 'audience', handlers: live },
  { path: '/api/live/{id}/answer', group: 'audience', handlers: liveAnswer },
  { path: '/api/live/{id}/qa', group: 'audience', handlers: liveQa },
  { path: '/api/live/{id}/qa/{qid}/vote', group: 'audience', handlers: liveQaVote },
  { path: '/api/live/{id}/qa/{qid}/withdraw', group: 'audience', handlers: liveQaWithdraw },
];
