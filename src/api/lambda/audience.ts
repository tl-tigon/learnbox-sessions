/** The audience group's Lambda. */
import { serve } from './adapter';
import { AUDIENCE } from '../routes/audience';

export const handler = serve(AUDIENCE);
