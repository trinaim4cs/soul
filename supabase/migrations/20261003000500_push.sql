-- SOUL Phase 14: push notifications (spec 44, 68; DECISIONS D-018, D-054).
--
--   * one notification per real event: a new match, a message, an Instant Meet session that
--     started, a payment confirmed or refunded. No engagement or "come back" notifications
--   * a notification never contains a message's text, only who it is from
--   * each person chooses which kinds they get; blocked or unmatched pairs get nothing more
--   * delivery is server-side: an outbox, drained by the push-send Edge Function (FCM for the
--     Android app, Web Push for the iPhone PWA). SOUL works fully without push

create extension if not exists pg_net;

insert into public.app_config (key, value, client_visible, description) values
  -- Where the database pings push-send: the cloud project (C-17). The local seed points it at the
  -- local stack; null turns delivery off.
  ('push_dispatch_url', '"https://bdwuhrkgrwzpwqhgsngi.supabase.co/functions/v1/push-send"', false,
   'push-send Edge Function URL; null turns delivery off.')
on conflict (key) do nothing;

------------------------------------------------------------------------------
-- Devices, settings and the outbox. No client access to any table.
------------------------------------------------------------------------------
create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  fcm_token text unique,
  web_endpoint text unique,
  web_p256dh text,
  web_auth text,
  created_at timestamptz not null default now(),
  registered_at timestamptz not null default now(),
  failures integer not null default 0,
  disabled_at timestamptz,
  constraint push_platform_valid check (platform in ('android', 'web')),
  constraint push_device_shape check (
    (platform = 'android' and fcm_token is not null and web_endpoint is null)
    or (platform = 'web' and fcm_token is null and web_endpoint is not null
        and web_p256dh is not null and web_auth is not null)),
  constraint push_endpoint_https check (web_endpoint is null or web_endpoint like 'https://%')
);
create index push_devices_user_idx on public.push_devices (user_id) where disabled_at is null;
alter table public.push_devices enable row level security;
alter table public.push_devices force row level security;
revoke all on public.push_devices from anon, authenticated;

create table public.notification_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  matches boolean not null default true,
  messages boolean not null default true,
  instant boolean not null default true,
  payments boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
alter table public.notification_settings force row level security;
revoke all on public.notification_settings from anon, authenticated;

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  url text not null,
  -- Later notifications with the same key replace earlier ones on the device (one per chat).
  collapse_key text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  constraint outbox_kind_valid check (kind in ('match', 'message', 'instant', 'payment')),
  constraint outbox_url_internal check (url like '/%' and url not like '//%')
);
create index notification_outbox_pending_idx on public.notification_outbox (created_at) where sent_at is null;
alter table public.notification_outbox enable row level security;
alter table public.notification_outbox force row level security;
revoke all on public.notification_outbox from anon, authenticated;

------------------------------------------------------------------------------
-- Enqueueing. Every path checks the person's choice for that kind.
------------------------------------------------------------------------------
create function private.wants_push(p_user uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_kind when 'match' then matches when 'message' then messages
                       when 'instant' then instant when 'payment' then payments end
    from public.notification_settings where user_id = p_user), true);
$$;
revoke all on function private.wants_push(uuid, text) from public, anon, authenticated;

-- What a notification calls the other person: the same rule as cards, so an anonymous
-- profile stays "Anonymous" unless it reveals itself on a match.
create function private.push_name(p_other uuid, p_for_match boolean)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when p.privacy_mode = 'anonymous' and not (p_for_match and p.reveal_on_match)
                then 'Anonymous' else nullif(p.display_name, '') end
    from public.profiles p where p.id = p_other), 'Anonymous');
$$;
revoke all on function private.push_name(uuid, boolean) from public, anon, authenticated;

create function private.enqueue_push(
  p_user uuid, p_kind text, p_title text, p_body text, p_url text, p_collapse text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch text;
begin
  if p_user is null or not private.wants_push(p_user, p_kind) or not private.is_eligible(p_user) then
    return;
  end if;
  if not exists (select 1 from public.push_devices where user_id = p_user and disabled_at is null) then
    return;
  end if;
  insert into public.notification_outbox (user_id, kind, title, body, url, collapse_key)
  values (p_user, p_kind, left(p_title, 80), left(p_body, 160), p_url, p_collapse);
  -- Wake the sender now; a per-minute job retries anything left. The ping carries no data.
  dispatch := (private.config_value('push_dispatch_url')) #>> '{}';
  if dispatch is not null and dispatch like 'http%' then
    perform net.http_post(url := dispatch, body := '{}'::jsonb,
                          headers := '{"content-type": "application/json"}'::jsonb);
  end if;
end;
$$;
revoke all on function private.enqueue_push(uuid, text, text, text, text, text) from public, anon, authenticated;

create function private.push_on_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_push(new.user_a, 'match', 'It''s a match',
    'You and ' || private.push_name(new.user_b, true) || ' like each other.', '/match/' || new.id, null);
  perform private.enqueue_push(new.user_b, 'match', 'It''s a match',
    'You and ' || private.push_name(new.user_a, true) || ' like each other.', '/match/' || new.id, null);
  return new;
end;
$$;
revoke all on function private.push_on_match() from public, anon, authenticated;
create trigger on_match_push after insert on public.matches
  for each row execute function private.push_on_match();

-- Who wrote, never what. One notification per chat on the device (collapse key).
create function private.push_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid := private.other_member(new.sender_id, new.conversation_id);
  instant boolean;
begin
  if recipient is null or not private.can_use_conversation(recipient, new.conversation_id) then
    return new;
  end if;
  select instant_session_id is not null into instant from public.conversations where id = new.conversation_id;
  perform private.enqueue_push(recipient, 'message', private.push_name(new.sender_id, not instant),
    'Sent you a message',
    case when instant then '/instant/chat/' else '/chat/' end || new.conversation_id,
    'chat:' || new.conversation_id);
  return new;
end;
$$;
revoke all on function private.push_on_message() from public, anon, authenticated;
create trigger on_message_push after insert on public.messages
  for each row execute function private.push_on_message();

create function private.push_on_instant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_push(new.user_a, 'instant', 'Instant Meet is on',
    'You and ' || private.push_name(new.user_b, false) || ' both said yes. Open the compass.',
    '/instant/session/' || new.id, 'instant');
  perform private.enqueue_push(new.user_b, 'instant', 'Instant Meet is on',
    'You and ' || private.push_name(new.user_a, false) || ' both said yes. Open the compass.',
    '/instant/session/' || new.id, 'instant');
  return new;
end;
$$;
revoke all on function private.push_on_instant() from public, anon, authenticated;
create trigger on_instant_push after insert on public.instant_sessions
  for each row execute function private.push_on_instant();

create function private.push_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  title text := (select title from public.plans where id = new.plan_id);
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    perform private.enqueue_push(new.user_id, 'payment', 'Payment confirmed',
      coalesce(title, 'Your purchase') || ' is ready.', '/settings/purchases', null);
  elsif new.status = 'refunded' and old.status is distinct from 'refunded' then
    perform private.enqueue_push(new.user_id, 'payment', 'Refund processed',
      coalesce(title, 'Your purchase') || ' was refunded.', '/settings/purchases', null);
  end if;
  return new;
end;
$$;
revoke all on function private.push_on_payment() from public, anon, authenticated;
create trigger on_payment_push after update of status on public.payment_orders
  for each row execute function private.push_on_payment();

-- Suspension, ban or deletion stops every device at once (spec 45: invalidate push tokens).
-- A restored account registers again the next time the app opens.
create function private.push_on_account_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_state <> 'active' and old.account_state = 'active' then
    delete from public.push_devices where user_id = new.id;
    delete from public.notification_outbox where user_id = new.id and sent_at is null;
  end if;
  return new;
end;
$$;
revoke all on function private.push_on_account_state() from public, anon, authenticated;
create trigger on_account_state_push after update of account_state on public.account_private
  for each row execute function private.push_on_account_state();

------------------------------------------------------------------------------
-- The owner's choices.
------------------------------------------------------------------------------
create function public.get_notification_settings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  row public.notification_settings%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into row from public.notification_settings where user_id = uid;
  return jsonb_build_object(
    'ok', true,
    'matches', coalesce(row.matches, true),
    'messages', coalesce(row.messages, true),
    'instant', coalesce(row.instant, true),
    'payments', coalesce(row.payments, true),
    'devices', (select count(*) from public.push_devices where user_id = uid and disabled_at is null));
end;
$$;

create function public.set_notification_settings(
  p_matches boolean, p_messages boolean, p_instant boolean, p_payments boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_matches is null or p_messages is null or p_instant is null or p_payments is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  insert into public.notification_settings (user_id, matches, messages, instant, payments, updated_at)
  values (uid, p_matches, p_messages, p_instant, p_payments, now())
  on conflict (user_id) do update set matches = excluded.matches, messages = excluded.messages,
    instant = excluded.instant, payments = excluded.payments, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

------------------------------------------------------------------------------
-- Devices and delivery (service role only: the push-register and push-send functions).
------------------------------------------------------------------------------
create function public.push_register_device(
  p_user uuid, p_platform text, p_token text, p_endpoint text, p_p256dh text, p_auth text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.account_private where id = p_user and account_state = 'active') then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  if p_platform = 'android' then
    if coalesce(p_token, '') = '' or length(p_token) > 4096 then
      return jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;
    -- A token moves with its device: whoever registers it last receives its notifications.
    insert into public.push_devices (user_id, platform, fcm_token)
    values (p_user, 'android', p_token)
    on conflict (fcm_token) do update
      set user_id = excluded.user_id, registered_at = now(), failures = 0, disabled_at = null;
  elsif p_platform = 'web' then
    if coalesce(p_endpoint, '') not like 'https://%' or length(p_endpoint) > 2048
       or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
      return jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;
    insert into public.push_devices (user_id, platform, web_endpoint, web_p256dh, web_auth)
    values (p_user, 'web', p_endpoint, p_p256dh, p_auth)
    on conflict (web_endpoint) do update
      set user_id = excluded.user_id, web_p256dh = excluded.web_p256dh, web_auth = excluded.web_auth,
          registered_at = now(), failures = 0, disabled_at = null;
  else
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  -- Ten devices at most: the oldest registration goes first.
  delete from public.push_devices
  where id in (select id from public.push_devices where user_id = p_user
               order by registered_at desc offset 10);
  return jsonb_build_object('ok', true);
end;
$$;

create function public.push_unregister_device(p_user uuid, p_token text, p_endpoint text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with removed as (
    delete from public.push_devices
    where user_id = p_user and (fcm_token = p_token or web_endpoint = p_endpoint)
    returning 1)
  select jsonb_build_object('ok', true, 'removed', (select count(*) from removed));
$$;

-- Hands push-send a batch: each pending notification with the person's active devices.
create function public.push_claim(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed jsonb;
begin
  with batch as (
    select id from public.notification_outbox
    where sent_at is null and attempts < 5
      and (claimed_at is null or claimed_at < now() - interval '2 minutes')
      and created_at > now() - interval '1 day'
    order by created_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  ), marked as (
    update public.notification_outbox o set claimed_at = now(), attempts = o.attempts + 1
    from batch where o.id = batch.id
    returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'kind', m.kind, 'title', m.title, 'body', m.body, 'url', m.url, 'collapse_key', m.collapse_key,
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'platform', d.platform, 'token', d.fcm_token,
                                          'endpoint', d.web_endpoint, 'p256dh', d.web_p256dh, 'auth', d.web_auth))
      from public.push_devices d where d.user_id = m.user_id and d.disabled_at is null), '[]'::jsonb))
  ), '[]'::jsonb) into claimed
  from marked m;
  return claimed;
end;
$$;

create function public.push_mark(p_outbox bigint, p_sent boolean, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_outbox
    set sent_at = case when p_sent then now() end, last_error = left(p_error, 200)
    where id = p_outbox;
$$;

-- A device the push service no longer knows (uninstalled, unsubscribed) stops receiving.
create function public.push_device_failed(p_device uuid, p_gone boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_devices
    set failures = failures + 1,
        disabled_at = case when p_gone or failures + 1 >= 5 then now() else disabled_at end
    where id = p_device;
$$;

-- Retries and anything a missed ping left behind, once a minute.
create function private.push_dispatch_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch text := (private.config_value('push_dispatch_url')) #>> '{}';
begin
  if dispatch is not null and dispatch like 'http%'
     and exists (select 1 from public.notification_outbox where sent_at is null and attempts < 5
                 and created_at > now() - interval '1 day') then
    perform net.http_post(url := dispatch, body := '{}'::jsonb,
                          headers := '{"content-type": "application/json"}'::jsonb);
  end if;
  delete from public.notification_outbox where created_at < now() - interval '7 days';
end;
$$;
revoke all on function private.push_dispatch_tick() from public, anon, authenticated;
select cron.schedule('soul-push', '* * * * *', 'select private.push_dispatch_tick()');

revoke all on function public.get_notification_settings() from public, anon;
revoke all on function public.set_notification_settings(boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.get_notification_settings() to authenticated;
grant execute on function public.set_notification_settings(boolean, boolean, boolean, boolean) to authenticated;
revoke all on function public.push_register_device(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.push_unregister_device(uuid, text, text) from public, anon, authenticated;
revoke all on function public.push_claim(integer) from public, anon, authenticated;
revoke all on function public.push_mark(bigint, boolean, text) from public, anon, authenticated;
revoke all on function public.push_device_failed(uuid, boolean) from public, anon, authenticated;
grant execute on function public.push_register_device(uuid, text, text, text, text, text) to service_role;
grant execute on function public.push_unregister_device(uuid, text, text) to service_role;
grant execute on function public.push_claim(integer) to service_role;
grant execute on function public.push_mark(bigint, boolean, text) to service_role;
grant execute on function public.push_device_failed(uuid, boolean) to service_role;
