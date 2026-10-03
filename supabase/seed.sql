-- SOUL local development seed. Neutral identities only; never human names.
-- Runs on `supabase db reset` (local only). Required config lives in migrations.

insert into public.feature_flags (key, enabled, description) values
  ('chat_photos', false, 'Photo attachments in chat. Off until photo moderation ships.'),
  ('instant_meet', true, 'Instant Meet availability (plan entitlement still required).');

-- Local development only: the mock payment provider (D-052). Production keeps this false.
update public.app_config set value = 'true' where key = 'payments_allow_mock';

-- Local development only: the database pings the local push-send function (D-054).
update public.app_config set value = '"http://kong:8000/functions/v1/push-send"' where key = 'push_dispatch_url';
