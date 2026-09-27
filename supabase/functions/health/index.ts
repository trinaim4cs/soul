import { requireUser } from '../_shared/auth.ts';
import { handler, json } from '../_shared/http.ts';

// Smoke test for the Edge Function pipeline: authenticated callers get their own id back.
Deno.serve(
  handler(async (req) => {
    const { user } = await requireUser(req);
    return json({ ok: true, user_id: user.id });
  }),
);
