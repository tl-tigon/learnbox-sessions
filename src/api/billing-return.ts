import { store } from '@/lib/store';
import { finishOrder, siteOrigin } from '@/lib/billing';
import { seeOther } from '@/lib/http';

const toAccount = (req: Request, payment: string) => seeOther(`${siteOrigin(req)}/app/account?payment=${payment}`);

/**
 * Where the payment page sends the buyer's browser back, with the signed outcome as a form. The
 * caller is not signed in here: the signature says what happened, and to which account's order.
 */
export async function POST(req: Request) {
  const posted: Record<string, string> = {};
  try {
    for (const [k, v] of await req.formData()) if (typeof v === 'string') posted[k] = v;
  } catch {
    return toAccount(req, 'failed');
  }
  return toAccount(req, await finishOrder(store(), posted));
}

/** A browser that arrives without the form (a reload, a back button) goes to the account page. */
export const GET = (req: Request) => seeOther(`${siteOrigin(req)}/app/account`);
