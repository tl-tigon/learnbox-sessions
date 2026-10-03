/**
 * In development, Next.js hands every `/api` request to the same route table that the Lambdas
 * serve in production. The `.dev.ts` name keeps this file out of the static build (next.config.ts).
 */
import { ROUTES } from '@/api/all';
import { dispatch } from '@/api/routes';

/* `x-client-ip` is the Lambda adapter's to set, from what the CDN saw; here nobody sets it. */
const run = (req: Request) => {
  const headers = new Headers(req.headers);
  headers.delete('x-client-ip');
  return dispatch(new Request(req.url, { method: req.method, headers, body: req.body, duplex: 'half' } as RequestInit), ROUTES);
};
export { run as GET, run as POST, run as PUT, run as PATCH, run as DELETE };
