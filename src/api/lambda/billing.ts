/** The billing group's Lambda. */
import { serve } from './adapter';
import { BILLING } from '../routes/billing';

export const handler = serve(BILLING);
