# SOUL: Supabase Setup

## Local development

- **Docker Desktop's disk lives on D:** (`D:\soul-dev\docker\wsl`). It was moved on 2026-09-27 after C: filled up. Never move it back to C:.
- Start: `npm run db:start`. It runs Postgres 17, PostgREST, Auth (GoTrue), Realtime, Storage, the Edge Runtime and Mailpit, and skips Studio, analytics, vector and imgproxy to save memory and disk.
- Local URLs: API `http://127.0.0.1:54321`, DB `127.0.0.1:54322`, Mailpit (OTP emails) `http://127.0.0.1:54324`.
- The Android emulator reaches the host at `http://10.0.2.2:54321` (`EXPO_PUBLIC_SUPABASE_URL` in `.env`).
- The local anon and service keys are Supabase's fixed public demo keys, valid only for the local stack. `.env` is git-ignored.

## Projects (C-17)

| Env | Project | Used by |
|---|---|---|
| development | local Docker stack | `npm start`, `npm run web`, emulator dev builds (`.env`) |
| beta / production | cloud project `bdwuhrkgrwzpwqhgsngi` (`https://bdwuhrkgrwzpwqhgsngi.supabase.co`) | `npm run web:export`, Vercel, release APKs (`.env.production` locally, Vercel project env vars) |

Only the project URL and the publishable key (`sb_publishable_…`) are used by clients. Both are public by design; the database password, access tokens and secret keys never enter the repo, the app or chat.

### Deploying the schema to the cloud project (owner runs these; they need your Supabase login and database password)

```bash
npx supabase login                                        # opens the browser once
npx supabase link --project-ref bdwuhrkgrwzpwqhgsngi       # asks for the database password
npx supabase db push                                      # applies supabase/migrations in order
npx supabase config diff                                  # review auth settings before pushing
npx supabase config push                                  # OTP length/expiry, confirmations, email template, both auth hooks
npx supabase functions deploy health profile-photos payments-checkout payments-webhook payments-sync
```

Without `profile-photos` deployed, photos cannot be added (D-043).

**Payments (D-052, C-25).** Start in Razorpay's **test mode**; switch the same steps to live keys only after KYC.
1. In the Razorpay dashboard, make sure Payment Links is available, then create API keys (Account & Settings → API Keys).
2. Add a webhook (Account & Settings → Webhooks) for `https://bdwuhrkgrwzpwqhgsngi.supabase.co/functions/v1/payments-webhook` with the events `payment_link.paid`, `payment_link.expired`, `payment_link.cancelled` and `refund.processed`. Choose a long random secret.
3. Set the server secrets (they never go in the app, the repo or chat):
   ```bash
   npx supabase secrets set SOUL_ENV=production PAYMENTS_PROVIDER=razorpay PAYMENTS_SITE_URL=https://<your SOUL site> RAZORPAY_KEY_ID=<key id> RAZORPAY_KEY_SECRET=<key secret> RAZORPAY_WEBHOOK_SECRET=<webhook secret>
   ```
4. Deploy the payment functions (above). Do not deploy `payments-mock`; it refuses to run in production anyway.
5. `payments_allow_mock` stays `false` in the hosted database (only the local seed turns it on). Instant Meet needs nothing extra: PostGIS is created by the foundation migration, and expiry runs inside the Instant functions (no cron). The dates migration enables `pg_cron` and schedules `soul-dates-consistency` hourly; check it under Database → Cron after the push.

Then in the dashboard:
- **Authentication → URL configuration:** set Site URL to the Vercel URL.
- **Authentication → SMTP (required before real students can sign in, C-28):** Supabase's built-in email only reaches the project's team members and is heavily rate-limited. Without buying a domain, the simplest sender is a dedicated Gmail account for SOUL with 2-step verification and an app password (`smtp.gmail.com`, port 587, about 500 emails a day). You enter those credentials in the dashboard yourself.
- **Check the auth hardening (D-046):**
  - Authentication → Sign In / Providers → Email: **Confirm email** is on.
  - Authentication → Hooks: *Before User Created* → `public.hook_before_user_created`, and *Customize Access Token (JWT) Claims* → `public.hook_custom_access_token`.
  - Without the second hook, password sign-in would be possible again.
- **Realtime → Settings: turn off "Allow public access"**, so only private, authorized topics work (D-049).
- Check that `get_my_status` exists: `POST /rest/v1/rpc/get_my_status` with the publishable key returns 401 or a status, not `PGRST202`.

Never apply schema changes by hand; every change is a migration.

## Local test data for plans

No build can buy anything before Phase 12. To see the app with a plan or a top-up on the **local** stack, grant one the way the payment webhook will:

```bash
docker exec supabase_db_SOUL psql -U postgres -c "select public.activate_plan((select id from auth.users where email = 'testuser03@srmist.edu.in'), 'monthly', 'local-test-1');"
```

Plan ids are `weekly`, `monthly`, `quarter`, `half_year`, `topup_5`, `topup_12` and `topup_25`. Use a new key each time; the same key is granted only once.

## Edge Functions

`supabase/functions/`:

- `_shared/http.ts`: JSON responses with CORS headers and preflight handling (D-044); `HttpError` with a safe error envelope `{ error: { code, message } }`; no internal details in responses; logs without payloads.
- `_shared/auth.ts`: `requireUser(req)` builds a caller-scoped client, so RLS still applies. `serviceClient()` is for server-authoritative writes only. Both read the new key dictionaries when present, else the legacy keys.
- `_shared/jpeg.ts`: JPEG structure check and metadata stripping (pure, no imports; unit-tested under Jest with `scripts/fixtures`).
- `_shared/validate.ts`: Zod body parsing that rejects anything unexpected.
- `health/`: smoke test (authenticated returns 200 with the caller's id; unauthenticated returns 401).
- `profile-photos/`: `{ action: 'add', id, source }` checks the inbox upload, strips metadata, publishes and registers the photo; `{ action: 'remove', id }` removes the row and both files (D-043).
- `verify_jwt` is off for every function in `config.toml`; `requireUser` does the check (D-044). A new function needs its own `[functions.<name>]` entry, and the local stack must be restarted (`npm run db:stop` then `npm run db:start`) to serve it.

## Secrets

Only these values are ever bundled into the app: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `APP_ENV`. The service role, the Razorpay key secret and webhook secret, the Firebase service account and the Web Push VAPID private key exist only as Edge Function secrets (`supabase secrets set`).
