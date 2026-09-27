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
npx supabase config push                                  # OTP length/expiry, email template, before_user_created hook
npx supabase functions deploy health
```

Then in the dashboard:
- **Authentication → URL configuration:** set Site URL to the Vercel URL.
- **Authentication → SMTP (required before real students can sign in, C-28):** Supabase's built-in email only reaches the project's team members and is heavily rate-limited. Without buying a domain, the simplest sender is a dedicated Gmail account for SOUL with 2-step verification and an app password (`smtp.gmail.com`, port 587, about 500 emails a day). You enter those credentials in the dashboard yourself.
- Check that `get_my_status` exists: `POST /rest/v1/rpc/get_my_status` with the publishable key returns 401 or a status, not `PGRST202`.

Never apply schema changes by hand; every change is a migration.

## Edge Functions

`supabase/functions/`:

- `_shared/http.ts`: JSON responses; `HttpError` with a safe error envelope `{ error: { code, message } }`; no internal details in responses; logs without payloads.
- `_shared/auth.ts`: `requireUser(req)` builds a caller-scoped client, so RLS still applies. `serviceClient()` is for server-authoritative writes only.
- `_shared/validate.ts`: Zod body parsing that rejects anything unexpected.
- `health/`: smoke test (authenticated returns 200 with the caller's id; unauthenticated returns 401).

## Secrets

Only these values are ever bundled into the app: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `APP_ENV`. The service role, the Razorpay key secret and webhook secret, the Firebase service account and the Web Push VAPID private key exist only as Edge Function secrets (`supabase secrets set`).
