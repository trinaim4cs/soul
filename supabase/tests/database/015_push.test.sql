-- Phase 14: push notifications (spec 44, 45; DECISIONS D-054).
-- Neutral identities only. Only this file's fixtures are counted.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(58);

create function pg_temp.mk(p_id uuid, p_gender public.gender, p_show public.gender[])
returns void language plpgsql as $$
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (p_id, 'test.user.' || right(p_id::text, 12) || '@srmist.edu.in', 'authenticated', 'authenticated', now());
  update public.account_private
    set terms_version = (select value ->> 'version' from public.app_config where key = 'current_terms_version'),
        terms_accepted_at = now(),
        date_of_birth = (current_date - interval '22 years 10 days')::date,
        profile_completed_at = now() - interval '30 days'
    where id = p_id;
  update public.profiles set display_name = 'Test User ' || right(p_id::text, 2), hook = 'Hook', gender = p_gender
    where id = p_id;
  update public.preferences set show_me = p_show where user_id = p_id;
end $$;

create function pg_temp.act(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.outbox(p_user uuid, p_kind text) returns integer language sql as $$
  select count(*)::int from public.notification_outbox where user_id = p_user and kind = p_kind;
$$;

select pg_temp.mk('000000f1-0000-4000-8000-000000000001', 'woman', '{man}');   -- W
select pg_temp.mk('000000f1-0000-4000-8000-0000000000a1', 'man', '{woman}');   -- M1
select pg_temp.mk('000000f1-0000-4000-8000-0000000000a2', 'man', '{woman}');   -- M2, anonymous, never revealed
select pg_temp.mk('000000f1-0000-4000-8000-0000000000a3', 'man', '{woman}');   -- M3, no device
select pg_temp.mk('000000f1-0000-4000-8000-0000000000a4', 'man', '{woman}');   -- M4, turns messages off
update public.profiles set privacy_mode = 'anonymous', reveal_on_match = false
  where id = '000000f1-0000-4000-8000-0000000000a2';
update public.app_config set value = 'true' where key = 'payments_allow_mock';
update public.app_config set value = '"http://push.invalid/functions/v1/push-send"' where key = 'push_dispatch_url';
create temp table t (name text primary key, id uuid, n bigint);
grant all on t to authenticated, service_role;

-- ---------------------------------------------------------------- nothing for the app to touch
set local role authenticated;
select pg_temp.act('000000f1-0000-4000-8000-000000000001');
select throws_ok($$select count(*) from public.push_devices$$, '42501', null, 'the app cannot read devices');
select throws_ok($$select count(*) from public.notification_settings$$, '42501', null, 'nor settings tables');
select throws_ok($$select count(*) from public.notification_outbox$$, '42501', null, 'nor the outbox');
select throws_ok($$select public.push_register_device('000000f1-0000-4000-8000-000000000001', 'android', 'tok', null, null, null)$$,
  '42501', null, 'the app cannot register a device for anyone directly');
select throws_ok($$select public.push_claim(10)$$, '42501', null, 'nor claim notifications');
select throws_ok($$select public.push_mark(1, true, null)$$, '42501', null, 'nor mark them sent');
select throws_ok($$select public.push_device_failed(gen_random_uuid(), true)$$, '42501', null, 'nor disable devices');

-- ---------------------------------------------------------------- the owner's choices
select is(public.get_notification_settings() - 'devices',
  '{"ok": true, "matches": true, "messages": true, "instant": true, "payments": true}'::jsonb,
  'everything is on by default');
select is(public.set_notification_settings(true, null, true, true) ->> 'reason', 'invalid', 'every choice is required');
select pg_temp.act('000000f1-0000-4000-8000-0000000000a4');
select is(public.set_notification_settings(true, false, true, true) ->> 'ok', 'true', 'M4 turns messages off');
select is(public.get_notification_settings() ->> 'messages', 'false', 'and it is kept');
reset role;

-- ---------------------------------------------------------------- devices (service role)
set local role service_role;
select is(public.push_register_device('000000f1-0000-4000-8000-000000000001', 'android', '', null, null, null) ->> 'reason',
  'invalid', 'an empty token is refused');
select is(public.push_register_device('000000f1-0000-4000-8000-000000000001', 'web', null, 'http://fcm.googleapis.com/x', 'k', 'a') ->> 'reason',
  'invalid', 'a web endpoint must be https');
select is(public.push_register_device('000000f1-0000-4000-8000-000000000001', 'ios', 'tok', null, null, null) ->> 'reason',
  'invalid', 'only Android and web exist');
select is(public.push_register_device('000000f1-0000-4000-8000-000000000001', 'android', 'tok-w', null, null, null) ->> 'ok',
  'true', 'W registers her phone');
select is(public.push_register_device('000000f1-0000-4000-8000-000000000001', 'web', null, 'https://web.push.apple.com/w1', 'p256', 'auth') ->> 'ok',
  'true', 'and her iPhone PWA');
select public.push_register_device('000000f1-0000-4000-8000-0000000000a1', 'android', 'tok-m1', null, null, null);
select public.push_register_device('000000f1-0000-4000-8000-0000000000a2', 'android', 'tok-m2', null, null, null);
select public.push_register_device('000000f1-0000-4000-8000-0000000000a4', 'android', 'tok-m4', null, null, null);
-- A phone that changes hands: the token belongs to whoever signed in last.
select public.push_register_device('000000f1-0000-4000-8000-0000000000a3', 'android', 'tok-shared', null, null, null);
select public.push_register_device('000000f1-0000-4000-8000-0000000000a4', 'android', 'tok-shared', null, null, null);
reset role;
select is((select user_id from public.push_devices where fcm_token = 'tok-shared'), '000000f1-0000-4000-8000-0000000000a4'::uuid,
  'a token moves to whoever registered it last');
select is((select count(*)::int from public.push_devices where user_id = '000000f1-0000-4000-8000-0000000000a3'), 0,
  'so the previous person no longer gets notifications on that phone');
set local role authenticated;
select pg_temp.act('000000f1-0000-4000-8000-000000000001');
select is(public.get_notification_settings() ->> 'devices', '2', 'the owner sees how many devices are on');
reset role;

-- ---------------------------------------------------------------- a match
insert into t (name, n) select 'queue', count(*) from net.http_request_queue;
insert into public.matches (user_a, user_b) values
  ('000000f1-0000-4000-8000-000000000001', '000000f1-0000-4000-8000-0000000000a1'),
  ('000000f1-0000-4000-8000-000000000001', '000000f1-0000-4000-8000-0000000000a2'),
  ('000000f1-0000-4000-8000-000000000001', '000000f1-0000-4000-8000-0000000000a3'),
  ('000000f1-0000-4000-8000-000000000001', '000000f1-0000-4000-8000-0000000000a4');
select is(pg_temp.outbox('000000f1-0000-4000-8000-000000000001', 'match'), 4, 'W is told about each match');
select is(pg_temp.outbox('000000f1-0000-4000-8000-0000000000a1', 'match'), 1, 'and so is the other person');
select is(pg_temp.outbox('000000f1-0000-4000-8000-0000000000a3', 'match'), 0,
  'nothing is queued for someone with no device');
select is((select url from public.notification_outbox where user_id = '000000f1-0000-4000-8000-0000000000a1'),
  '/match/' || (select id from public.matches where user_b = '000000f1-0000-4000-8000-0000000000a1'),
  'the notification opens the match');
select is((select body from public.notification_outbox where user_id = '000000f1-0000-4000-8000-0000000000a1'),
  'You and Test User 01 like each other.', 'and names the other person as a card would');
select ok((select body from public.notification_outbox where user_id = '000000f1-0000-4000-8000-000000000001' and kind = 'match'
           and url = '/match/' || (select id from public.matches where user_b = '000000f1-0000-4000-8000-0000000000a2'))
          like '%Anonymous%', 'an anonymous profile stays anonymous');
select ok((select count(*) from net.http_request_queue) > (select n from t where name = 'queue'),
  'each notification wakes the sender (an empty ping)');
select ok(not exists (select 1 from net.http_request_queue where body::text like '%Test User%'),
  'the ping carries no content');

-- ---------------------------------------------------------------- a message
create temp table conv on commit drop as
  select c.id, case when m.user_a = '000000f1-0000-4000-8000-000000000001' then m.user_b else m.user_a end as other
  from public.conversations c join public.matches m on m.id = c.match_id
  where m.user_a::text like '000000f1-%' and m.user_b::text like '000000f1-%';
grant select on conv to authenticated;
set local role authenticated;
select pg_temp.act('000000f1-0000-4000-8000-0000000000a1');
select public.send_message((select id from conv where other = '000000f1-0000-4000-8000-0000000000a1'), 'a private line', gen_random_uuid());
select public.send_message((select id from conv where other = '000000f1-0000-4000-8000-0000000000a1'), 'another line', gen_random_uuid());
select pg_temp.act('000000f1-0000-4000-8000-000000000001');
select public.send_message((select id from conv where other = '000000f1-0000-4000-8000-0000000000a4'), 'hello M4', gen_random_uuid());
reset role;
select is(pg_temp.outbox('000000f1-0000-4000-8000-000000000001', 'message'), 2, 'the recipient is told about each message');
select is(pg_temp.outbox('000000f1-0000-4000-8000-0000000000a1', 'message'), 0, 'the sender is not');
select ok(not exists (select 1 from public.notification_outbox where kind = 'message'
                      and (title || body) like '%line%'), 'a notification never contains the message');
select is((select distinct collapse_key from public.notification_outbox
           where user_id = '000000f1-0000-4000-8000-000000000001' and kind = 'message'),
  'chat:' || (select id from conv where other = '000000f1-0000-4000-8000-0000000000a1'),
  'messages in one chat replace each other on the device');
select is((select distinct url from public.notification_outbox
           where user_id = '000000f1-0000-4000-8000-000000000001' and kind = 'message'),
  '/chat/' || (select id from conv where other = '000000f1-0000-4000-8000-0000000000a1'), 'and open that chat');
select is(pg_temp.outbox('000000f1-0000-4000-8000-0000000000a4', 'message'), 0, 'someone who turned messages off gets none');

-- ---------------------------------------------------------------- Instant Meet and payments
insert into public.instant_sessions (user_a, user_b, expires_at)
values ('000000f1-0000-4000-8000-000000000001', '000000f1-0000-4000-8000-0000000000a2', now() + interval '20 minutes');
select is(pg_temp.outbox('000000f1-0000-4000-8000-000000000001', 'instant'), 1, 'an Instant Meet session tells W');
select is(pg_temp.outbox('000000f1-0000-4000-8000-0000000000a2', 'instant'), 1, 'and the other person');
select is((select url from public.notification_outbox where user_id = '000000f1-0000-4000-8000-0000000000a2' and kind = 'instant'),
  '/instant/session/' || (select id from public.instant_sessions where user_b = '000000f1-0000-4000-8000-0000000000a2'),
  'and opens the session');

set local role service_role;
insert into t (name, id) select 'order', (public.payment_create_order('000000f1-0000-4000-8000-000000000001', 'weekly', 'mock') -> 'order' ->> 'id')::uuid;
select public.payment_attach_link((select id from t where name = 'order'), 'plink_f1', null);
reset role;
select is(pg_temp.outbox('000000f1-0000-4000-8000-000000000001', 'payment'), 0, 'starting a checkout is not news');
set local role service_role;
select public.payment_mark_paid((select id from t where name = 'order'), 'plink_f1', 'pay_f1', 6900, 'INR');
select public.payment_mark_paid((select id from t where name = 'order'), 'plink_f1', 'pay_f1', 6900, 'INR');
reset role;
select is((select body from public.notification_outbox where user_id = '000000f1-0000-4000-8000-000000000001' and kind = 'payment'),
  'Weekly is ready.', 'a confirmed payment is, once');
set local role service_role;
select public.payment_mark_refunded('pay_f1', 'rfnd_f1', 6900);
reset role;
select is(pg_temp.outbox('000000f1-0000-4000-8000-000000000001', 'payment'), 2, 'and so is a refund');

-- ---------------------------------------------------------------- delivery
set local role service_role;
insert into t (name, n) select 'claimed', jsonb_array_length(
  (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(public.push_claim(200)) e
   where (e ->> 'id')::bigint in (select id from public.notification_outbox where user_id::text like '000000f1-%')));
reset role;
select is((select n from t where name = 'claimed'),
  (select count(*) from public.notification_outbox where user_id::text like '000000f1-%'),
  'the sender claims every pending notification');
select is((select count(*)::int from public.notification_outbox where user_id::text like '000000f1-%' and attempts = 1),
  (select count(*)::int from public.notification_outbox where user_id::text like '000000f1-%'), 'each claim counts an attempt');
set local role service_role;
select is((select count(*)::int from jsonb_array_elements(public.push_claim(200)) e
           where (e ->> 'id')::bigint in (select id from public.notification_outbox where user_id::text like '000000f1-%')),
  0, 'a second sender does not take the same notifications');
reset role;
update public.notification_outbox set claimed_at = now() - interval '3 minutes'
  where user_id = '000000f1-0000-4000-8000-000000000001' and kind = 'payment';
set local role service_role;
select is((select jsonb_array_length(e -> 'devices') from jsonb_array_elements(public.push_claim(200)) e
           where (e ->> 'id')::bigint = (select min(id) from public.notification_outbox
                                         where user_id = '000000f1-0000-4000-8000-000000000001' and kind = 'payment')),
  2, 'an abandoned claim is retried, with every active device');
select public.push_mark((select min(id) from public.notification_outbox
                         where user_id = '000000f1-0000-4000-8000-000000000001' and kind = 'payment'), true, null);
reset role;
select ok((select sent_at is not null from public.notification_outbox where id = (select min(id) from public.notification_outbox
           where user_id = '000000f1-0000-4000-8000-000000000001' and kind = 'payment')), 'a delivered notification is marked');

set local role service_role;
select public.push_device_failed((select id from public.push_devices where web_endpoint = 'https://web.push.apple.com/w1'), true);
select public.push_device_failed((select id from public.push_devices where fcm_token = 'tok-m2'), false);
reset role;
select ok((select disabled_at is not null from public.push_devices where web_endpoint = 'https://web.push.apple.com/w1'),
  'a device the push service no longer knows stops at once');
select ok((select disabled_at is null and failures = 1 from public.push_devices where fcm_token = 'tok-m2'),
  'a passing failure is only counted');
update public.push_devices set failures = 4 where fcm_token = 'tok-m2';
set local role service_role;
select public.push_device_failed((select id from public.push_devices where fcm_token = 'tok-m2'), false);
reset role;
select ok((select disabled_at is not null from public.push_devices where fcm_token = 'tok-m2'), 'five in a row stop it');
insert into public.instant_sessions (user_a, user_b, expires_at, ended_at)
values ('000000f1-0000-4000-8000-0000000000a2', '000000f1-0000-4000-8000-0000000000a3', now() + interval '20 minutes', now());
select is(pg_temp.outbox('000000f1-0000-4000-8000-0000000000a2', 'instant'), 1,
  'nothing more is queued for someone whose devices all stopped');
set local role service_role;
select public.push_register_device('000000f1-0000-4000-8000-0000000000a2', 'android', 'tok-m2', null, null, null);
reset role;
select ok((select disabled_at is null and failures = 0 from public.push_devices where fcm_token = 'tok-m2'),
  'registering again turns a device back on');
set local role service_role;
select is(public.push_unregister_device('000000f1-0000-4000-8000-0000000000a2', 'tok-m2', null) ->> 'removed', '1',
  'signing out removes the device');
select is(public.push_unregister_device('000000f1-0000-4000-8000-0000000000a2', 'tok-m1', null) ->> 'removed', '0',
  'but never someone else''s');
reset role;

set local role service_role;
select public.push_register_device('000000f1-0000-4000-8000-0000000000a3', 'android', 'tok-many-' || n, null, null, null)
  from generate_series(1, 12) n;
reset role;
select is((select count(*)::int from public.push_devices where user_id = '000000f1-0000-4000-8000-0000000000a3'), 10,
  'one person keeps ten devices at most');

-- ---------------------------------------------------------------- suspension, blocks, retention
update public.account_private set account_state = 'suspended' where id = '000000f1-0000-4000-8000-0000000000a1';
select is((select count(*)::int from public.push_devices where user_id = '000000f1-0000-4000-8000-0000000000a1'), 0,
  'a suspension removes every device');
select is((select count(*)::int from public.notification_outbox
           where user_id = '000000f1-0000-4000-8000-0000000000a1' and sent_at is null), 0, 'and anything unsent');
set local role service_role;
select is(public.push_register_device('000000f1-0000-4000-8000-0000000000a1', 'android', 'tok-m1', null, null, null) ->> 'reason',
  'not_available', 'and a suspended account cannot register one');
reset role;
set local role authenticated;
select pg_temp.act('000000f1-0000-4000-8000-000000000001');
select public.block_user('000000f1-0000-4000-8000-0000000000a4');
select pg_temp.act('000000f1-0000-4000-8000-0000000000a4');
select public.send_message((select id from conv where other = '000000f1-0000-4000-8000-0000000000a4'), 'still there?', gen_random_uuid());
reset role;
select is((select count(*)::int from public.notification_outbox where user_id = '000000f1-0000-4000-8000-000000000001'
           and collapse_key = 'chat:' || (select id from conv where other = '000000f1-0000-4000-8000-0000000000a4')), 0,
  'nothing reaches someone through a chat they blocked');
select throws_ok($$insert into public.notification_outbox (user_id, kind, title, body, url)
                   values ('000000f1-0000-4000-8000-000000000001', 'match', 't', 'b', 'https://example.invalid/')$$,
  '23514', null, 'a notification can only open a page inside SOUL');
update public.notification_outbox set created_at = now() - interval '8 days'
  where user_id = '000000f1-0000-4000-8000-000000000001' and kind = 'match';
select private.push_dispatch_tick();
select is(pg_temp.outbox('000000f1-0000-4000-8000-000000000001', 'match'), 0, 'the outbox forgets after a week');

select * from finish();
rollback;
