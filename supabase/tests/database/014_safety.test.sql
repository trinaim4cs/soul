-- Phase 13: safety and moderation (spec 42, 45, 67; DECISIONS D-053).
-- Neutral identities only. Only this file's fixtures are counted.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(62);

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
  update public.profiles set display_name = 'Test User', hook = 'Hook', gender = p_gender where id = p_id;
  update public.preferences set show_me = p_show where user_id = p_id;
  insert into public.profile_photos (id, user_id, storage_path, blurred_path, position, status, source, width, height)
  values (p_id, p_id, p_id || '/' || p_id || '.jpg', p_id || '/' || p_id || '.jpg', 0, 'approved', 'camera', 1080, 1350);
end $$;

create function pg_temp.act(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.mk('000000f0-0000-4000-8000-000000000001', 'woman', '{man}');   -- W
select pg_temp.mk('000000f0-0000-4000-8000-0000000000a1', 'man', '{woman}');   -- M1, matched, then blocked
select pg_temp.mk('000000f0-0000-4000-8000-0000000000a2', 'man', '{woman}');   -- M2, reported
select pg_temp.mk('000000f0-0000-4000-8000-0000000000a3', 'man', '{woman}');   -- M3, suspended
select pg_temp.mk('000000f0-0000-4000-8000-0000000000a4', 'man', '{woman}');   -- M4, banned
select pg_temp.mk('000000f0-0000-4000-8000-0000000000a5', 'man', '{woman}');   -- M5, deletes the account
select pg_temp.mk('000000f0-0000-4000-8000-0000000000b1', 'woman', '{man}');   -- moderator
select pg_temp.mk('000000f0-0000-4000-8000-0000000000b2', 'woman', '{man}');   -- another reporter
select pg_temp.mk('000000f0-0000-4000-8000-0000000000b3', 'woman', '{man}');   -- another reporter
insert into public.admin_roles (user_id, role) values ('000000f0-0000-4000-8000-0000000000b1', 'moderator');
insert into public.matches (user_a, user_b) values
  ('000000f0-0000-4000-8000-000000000001', '000000f0-0000-4000-8000-0000000000a1'),
  ('000000f0-0000-4000-8000-000000000001', '000000f0-0000-4000-8000-0000000000a2'),
  ('000000f0-0000-4000-8000-000000000001', '000000f0-0000-4000-8000-0000000000a4'),
  ('000000f0-0000-4000-8000-000000000001', '000000f0-0000-4000-8000-0000000000a5');
create temp table conv on commit drop as
  select c.id, case when m.user_a = '000000f0-0000-4000-8000-000000000001' then m.user_b else m.user_a end as other
  from public.conversations c join public.matches m on m.id = c.match_id
  where m.user_a::text like '000000f0-%' and m.user_b::text like '000000f0-%';
grant select on conv to authenticated;
insert into public.instant_sessions (user_a, user_b, expires_at)
values ('000000f0-0000-4000-8000-000000000001', '000000f0-0000-4000-8000-0000000000a1', now() + interval '20 minutes');
insert into public.date_rounds (user_a, user_b, source, closes_at, a_answer, a_answered_at)
values ('000000f0-0000-4000-8000-000000000001', '000000f0-0000-4000-8000-0000000000a1', 'match', now() + interval '6 days', true, now());

set local role authenticated;
-- A few messages, so reports carry evidence.
select pg_temp.act('000000f0-0000-4000-8000-0000000000a2');
select public.send_message((select id from conv where other = '000000f0-0000-4000-8000-0000000000a2'), 'first from M2', gen_random_uuid());
select pg_temp.act('000000f0-0000-4000-8000-000000000001');
select public.send_message((select id from conv where other = '000000f0-0000-4000-8000-0000000000a2'), 'reply from W', gen_random_uuid());

-- ---------------------------------------------------------------- nothing for the app to read
select throws_ok($$select count(*) from public.reports$$, '42501', null, 'the app cannot read reports');
select throws_ok($$select count(*) from public.moderation_actions$$, '42501', null, 'nor moderation actions');
select throws_ok($$select count(*) from private.banned_emails$$, '42501', null, 'nor banned addresses');

-- ---------------------------------------------------------------- block
select is(public.block_user('000000f0-0000-4000-8000-000000000001') ->> 'reason', 'invalid', 'nobody blocks themselves');
select is(public.block_user('000000f0-0000-4000-8000-0000000000a1') ->> 'ok', 'true', 'W blocks M1');
reset role;
select is((select active from public.matches where user_b = '000000f0-0000-4000-8000-0000000000a1'), false,
  'the match ends');
select ok((select closed_at is not null from public.conversations c join conv on conv.id = c.id
           where conv.other = '000000f0-0000-4000-8000-0000000000a1'), 'its chat closes');
select ok((select ended_at is not null from public.instant_sessions where user_b = '000000f0-0000-4000-8000-0000000000a1'),
  'a live Instant Meet between them ends');
select is((select status from public.date_rounds where user_b = '000000f0-0000-4000-8000-0000000000a1'), 'void',
  'and a pending date is voided');
set local role authenticated;
select is(public.get_profile_card('000000f0-0000-4000-8000-0000000000a1') ->> 'reason', 'not_available',
  'the blocker no longer sees them');
select pg_temp.act('000000f0-0000-4000-8000-0000000000a1');
select is(public.get_profile_card('000000f0-0000-4000-8000-000000000001') ->> 'reason', 'not_available',
  'nor they the blocker');
select is(public.send_message((select id from conv where other = '000000f0-0000-4000-8000-0000000000a1'), 'hello?', gen_random_uuid()) ->> 'reason',
  'not_available', 'they can no longer message');
select is((select count(*)::int from public.blocks where blocked_id = '000000f0-0000-4000-8000-0000000000a1'), 0,
  'and they cannot see that a block exists');
select is(public.get_my_matches() -> 'matches', '[]'::jsonb, 'their side looks like an ordinary unmatch');
select pg_temp.act('000000f0-0000-4000-8000-000000000001');
select is(public.get_my_blocks() -> 'blocks' -> 0 ->> 'id', '000000f0-0000-4000-8000-0000000000a1',
  'the blocker sees who they blocked');
select is(public.block_user('000000f0-0000-4000-8000-0000000000a1') ->> 'ok', 'true', 'blocking twice is harmless');

-- ---------------------------------------------------------------- unblock
select is(public.unblock_user('000000f0-0000-4000-8000-0000000000a1') ->> 'removed', 'true', 'W unblocks M1');
select is(public.get_my_blocks() -> 'blocks', '[]'::jsonb, 'the list is empty again');
reset role;
select is((select active from public.matches where user_b = '000000f0-0000-4000-8000-0000000000a1'), false,
  'unblocking never brings the match back');
set local role authenticated;
select pg_temp.act('000000f0-0000-4000-8000-0000000000a1');
select is(public.unblock_user('000000f0-0000-4000-8000-000000000001') ->> 'removed', 'false',
  'the blocked person cannot undo a block');

-- ---------------------------------------------------------------- report
select pg_temp.act('000000f0-0000-4000-8000-000000000001');
select is(public.report_user('000000f0-0000-4000-8000-0000000000a2', 'harassment', null, 'nowhere', false) ->> 'reason',
  'invalid', 'a report needs a known context');
select is(public.report_user('000000f0-0000-4000-8000-0000000000a2', 'harassment', repeat('x', 1001), 'chat', false) ->> 'reason',
  'invalid', 'details are limited to 1000 characters');
select is(public.report_user('000000f0-0000-4000-8000-000000000001', 'spam', null, 'chat', false) ->> 'reason',
  'invalid', 'nobody reports themselves');
select is(public.report_user('000000f0-0000-4000-8000-0000000000a2', 'harassment', 'Rude messages', 'chat', false) ->> 'ok',
  'true', 'W reports M2 from the chat');
reset role;
select is((select jsonb_array_length(evidence -> 'messages') from public.reports
           where reported_id = '000000f0-0000-4000-8000-0000000000a2'), 2,
  'the recent messages between them are kept as evidence');
select is((select evidence -> 'messages' -> 0 ->> 'from' from public.reports
           where reported_id = '000000f0-0000-4000-8000-0000000000a2'), 'reported',
  'with who said what');
select ok((select reported_fingerprint = private.user_fingerprint('000000f0-0000-4000-8000-0000000000a2')
           from public.reports where reported_id = '000000f0-0000-4000-8000-0000000000a2'),
  'and a fingerprint that outlives the account');
select ok(not (select priority from public.reports where reported_id = '000000f0-0000-4000-8000-0000000000a2'),
  'harassment from one person is not urgent by itself');
set local role authenticated;
select pg_temp.act('000000f0-0000-4000-8000-0000000000b2');
select public.report_user('000000f0-0000-4000-8000-0000000000a2', 'spam', null, 'profile', false);
select pg_temp.act('000000f0-0000-4000-8000-0000000000b3');
select is(public.report_user('000000f0-0000-4000-8000-0000000000a2', 'underage', null, 'discovery', true) ->> 'blocked',
  'true', 'a report can block in the same step');
reset role;
select is((select count(*)::int from public.reports where reported_id = '000000f0-0000-4000-8000-0000000000a2' and priority), 3,
  'three different reporters in a week make every report about them urgent');
select ok(exists (select 1 from public.blocks where blocker_id = '000000f0-0000-4000-8000-0000000000b3'
                  and blocked_id = '000000f0-0000-4000-8000-0000000000a2'), 'and the block is in place');
update public.app_config set value = '1' where key = 'report_daily_limit';
set local role authenticated;
select is(public.report_user('000000f0-0000-4000-8000-0000000000a3', 'spam', null, 'profile', false) ->> 'reason',
  'rate_limited', 'reports per day are limited');
reset role;
update public.app_config set value = '10' where key = 'report_daily_limit';

-- ---------------------------------------------------------------- moderation is for moderators
set local role authenticated;
select pg_temp.act('000000f0-0000-4000-8000-000000000001');
select throws_ok($$select public.moderation_queue()$$, '42501', null, 'only moderators see the queue');
select throws_ok($$select public.moderation_set_state('000000f0-0000-4000-8000-0000000000a3', 'suspended', 'community_rules', null)$$,
  '42501', null, 'or suspend anyone');
select pg_temp.act('000000f0-0000-4000-8000-0000000000b1');
select is((select count(*)::int from jsonb_array_elements(public.moderation_queue() -> 'reports') r
           where r ->> 'reported_id' like '000000f0-%'), 3, 'a moderator sees the open reports');
select ok((select bool_and(case when ord = 1 then (r ->> 'priority')::boolean else true end)
           from jsonb_array_elements(public.moderation_queue() -> 'reports') with ordinality as q(r, ord)),
  'urgent ones first');
select is(public.moderation_set_state('000000f0-0000-4000-8000-0000000000b1', 'suspended', null, null) ->> 'reason',
  'invalid', 'a moderator cannot act on themselves');

-- Suspend for a while.
select is(public.moderation_set_state('000000f0-0000-4000-8000-0000000000a3', 'suspended', 'community_rules',
          now() + interval '3 days') ->> 'ok', 'true', 'a moderator suspends M3 for three days');
reset role;
select ok(not private.is_eligible('000000f0-0000-4000-8000-0000000000a3'), 'M3 disappears from everything');
set local role authenticated;
select pg_temp.act('000000f0-0000-4000-8000-0000000000a3');
select is(public.get_my_status() ->> 'account_state', 'suspended', 'M3 is told the account is suspended');
select is(public.get_my_status() ->> 'restriction_reason', 'community_rules', 'with a reason category only');
select ok((public.get_my_status() ->> 'restricted_until')::timestamptz > now(), 'and until when');
reset role;
update public.account_private set restricted_until = now() - interval '1 minute'
  where id = '000000f0-0000-4000-8000-0000000000a3';
select private.retention_sweep();
select ok(private.is_eligible('000000f0-0000-4000-8000-0000000000a3'), 'a timed suspension ends by itself');

-- Ban.
set local role authenticated;
select pg_temp.act('000000f0-0000-4000-8000-0000000000b1');
select is(public.moderation_set_state('000000f0-0000-4000-8000-0000000000a4', 'banned', 'fake_account', null) ->> 'ok',
  'true', 'a moderator bans M4');
reset role;
select is((select active from public.matches where user_b = '000000f0-0000-4000-8000-0000000000a4'), false,
  'a ban ends their matches');
select is((public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object(
          'email', 'TEST.USER.0000000000a4@srmist.edu.in'))) -> 'error' ->> 'http_code'), '403',
  'the banned address cannot sign up again, whatever its case');
select is(public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object(
          'email', 'test.user.0000000000b2@srmist.edu.in'))), '{}'::jsonb, 'other addresses still can');
set local role authenticated;
select pg_temp.act('000000f0-0000-4000-8000-0000000000b1');
select is(public.moderation_set_state('000000f0-0000-4000-8000-0000000000a4', 'active', null, null) ->> 'ok', 'true',
  'a ban can be lifted');
reset role;
select is(public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object(
          'email', 'test.user.0000000000a4@srmist.edu.in'))), '{}'::jsonb, 'and the address is free again');
select is((select count(*)::int from public.moderation_actions where target_user::text like '000000f0-%'), 3,
  'every action is recorded');

-- Photos and reports.
update public.profile_photos set status = 'pending' where id = '000000f0-0000-4000-8000-0000000000a3';
set local role authenticated;
select pg_temp.act('000000f0-0000-4000-8000-0000000000b1');
select ok(public.moderation_queue() -> 'photos' @> '[{"id": "000000f0-0000-4000-8000-0000000000a3"}]',
  'photos waiting for review are in the queue');
select is(public.moderation_review_photo('000000f0-0000-4000-8000-0000000000a3', false, 'Not a photo of a person') ->> 'ok',
  'true', 'a moderator can reject a photo');
reset role;
select is((select status::text from public.profile_photos where id = '000000f0-0000-4000-8000-0000000000a3'), 'rejected',
  'and it is no longer shown');
create temp table spam_report on commit drop as
  select id from public.reports where reported_id = '000000f0-0000-4000-8000-0000000000a2' and category = 'spam';
grant select on spam_report to authenticated;
set local role authenticated;
select pg_temp.act('000000f0-0000-4000-8000-0000000000b1');
select is(public.moderation_resolve_report((select id from spam_report), false, 'Not spam') ->> 'ok', 'true',
  'a report can be dismissed');

-- ---------------------------------------------------------------- deletion
select pg_temp.act('000000f0-0000-4000-8000-0000000000a5');
select throws_ok($$select public.account_prepare_deletion('000000f0-0000-4000-8000-0000000000a5')$$, '42501', null,
  'deletion runs only through the server function');
reset role;
insert into public.reports (reporter_id, reported_id, reported_fingerprint, category, context)
values ('000000f0-0000-4000-8000-000000000001', '000000f0-0000-4000-8000-0000000000a5',
        private.user_fingerprint('000000f0-0000-4000-8000-0000000000a5'), 'threat', 'chat');
insert into public.payment_orders (user_id, plan_id, amount_paise, provider, expires_at, status, paid_at, provider_payment_id)
values ('000000f0-0000-4000-8000-0000000000a5', 'weekly', 6900, 'mock', now(), 'paid', now(), 'pay_test_a5');
set local role service_role;
select is(public.account_prepare_deletion('000000f0-0000-4000-8000-0000000000a5') ->> 'ok', 'true',
  'deletion first withdraws the account');
reset role;
select is((select active from public.matches where user_b = '000000f0-0000-4000-8000-0000000000a5'), false,
  'which ends its matches at once');
delete from auth.users where id = '000000f0-0000-4000-8000-0000000000a5';
select is((select count(*)::int from public.reports
           where reported_fingerprint = private.email_fingerprint('test.user.0000000000a5@srmist.edu.in')), 1,
  'the safety record outlives the account');
select is((select count(*)::int from public.payment_orders where provider_payment_id = 'pay_test_a5' and user_id is null), 1,
  'so does the purchase record, without the account');
select is((select count(*)::int from public.profiles where id = '000000f0-0000-4000-8000-0000000000a5'), 0,
  'everything else about the person is gone');

-- ---------------------------------------------------------------- retention
insert into public.instant_sessions (user_a, user_b, started_at, expires_at, ended_at)
values ('000000f0-0000-4000-8000-000000000001', '000000f0-0000-4000-8000-0000000000b2',
        now() - interval '91 days', now() - interval '91 days', now() - interval '91 days');
update public.reports set status = 'dismissed', resolved_at = now() - interval '366 days'
  where reported_id = '000000f0-0000-4000-8000-0000000000a3';
select private.retention_sweep();
select is((select count(*)::int from public.instant_sessions
           where user_b = '000000f0-0000-4000-8000-0000000000b2'), 0, 'Instant Meet records go after 90 days');
select ok(exists (select 1 from cron.job where jobname = 'soul-retention'), 'and the retention job is scheduled');

select * from finish();
rollback;
