import { store } from '@/lib/store';
import { deleteAccountData } from '@/lib/account';
import { isResponse, json, requireUser } from '@/lib/http';

/** Deletes everything the signed-in facilitator owns. */
export async function DELETE(req: Request) {
  const u = await requireUser(req);
  if (isResponse(u)) return u;
  return json({ ok: true, ...(await deleteAccountData(store(), u.sub)) });
}
