/** In development, the shared join link is served by the same route table as in production. */
import { ROUTES } from '@/api/all';
import { dispatch } from '@/api/routes';

export const GET = (req: Request) => dispatch(req, ROUTES);
