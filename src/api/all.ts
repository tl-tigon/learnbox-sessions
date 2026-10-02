/** Every route, for development and for the manifest. Production bundles one group at a time. */
import { AUDIENCE } from './routes/audience';
import { BILLING } from './routes/billing';
import { HOST } from './routes/host';
import type { Route } from './routes';

export const ROUTES: Route[] = [...AUDIENCE, ...HOST, ...BILLING];
