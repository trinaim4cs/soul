import { z } from 'npm:zod@4';

import { requireUser, serviceClient } from '../_shared/auth.ts';
import { HttpError, handler, json } from '../_shared/http.ts';
import { parseBody } from '../_shared/validate.ts';

// Account deletion (spec 43, 67; DECISIONS D-053). The person asks; the server does the rest at
// once: withdraws the account from everything, deletes the photo files, then deletes the
// account, which removes everything else about it. Safety and purchase records stay, without
// the account (see the retention policy). Every session ends with the account.

const body = z.object({ confirm: z.literal('DELETE') });
const BUCKETS = ['profile-photos', 'profile-photos-blurred', 'photo-uploads'];

Deno.serve(
  handler(async (req) => {
    if (req.method !== 'POST') throw new HttpError('invalid_request', 'Use POST.');
    const { user } = await requireUser(req);
    await parseBody(req, body);
    const service = serviceClient();

    const prepared = await service.rpc('account_prepare_deletion', { p_user: user.id });
    if (prepared.error) throw prepared.error;
    if (!prepared.data?.ok) throw new HttpError('not_found', 'No such account.');

    for (const bucket of BUCKETS) {
      for (;;) {
        const listed = await service.storage.from(bucket).list(user.id, { limit: 100 });
        if (listed.error) throw listed.error;
        const names = (listed.data ?? []).map((item) => `${user.id}/${item.name}`);
        if (names.length === 0) break;
        const removed = await service.storage.from(bucket).remove(names);
        if (removed.error) throw removed.error;
        if (names.length < 100) break;
      }
    }

    const deleted = await service.auth.admin.deleteUser(user.id);
    if (deleted.error) throw deleted.error;
    return json({ ok: true });
  }),
);
