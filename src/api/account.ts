import { store } from '@/lib/store';
import { deleteAccountData } from '@/lib/account';
import { accountView, reconcile } from '@/lib/billing';
import { isResponse, json, requireUser } from '@/lib/http';

/** The signed-in facilitator's plan. A payment whose outcome has not arrived yet is looked up first. */
export async function GET(req: Request) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  await reconcile(store(), u.sub);
  return json(await accountView(store(), u.sub));
}

/** Deletes everything the signed-in facilitator owns. */
export async function DELETE(req: Request) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  return json({ ok: true, ...(await deleteAccountData(store(), u.sub)) });
}
