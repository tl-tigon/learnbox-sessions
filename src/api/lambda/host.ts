/** The host group's Lambda. */
import { serve } from './adapter';
import { HOST } from '../routes/host';

export const handler = serve(HOST);
