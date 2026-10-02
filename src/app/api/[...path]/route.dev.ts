/**
 * In development, Next.js hands every `/api` request to the same route table that the Lambdas
 * serve in production. The `.dev.ts` name keeps this file out of the static build (next.config.ts).
 */
import { ROUTES } from '@/api/all';
import { dispatch } from '@/api/routes';

const run = (req: Request) => dispatch(req, ROUTES);
export { run as GET, run as POST, run as PUT, run as PATCH, run as DELETE };
