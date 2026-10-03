-- Phase 15: admin and operations (spec 45, 69; DECISIONS D-055).
-- Neutral identities only. Only this file's fixtures are counted.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(70);

create function pg_temp.mk(p_id uuid, p_gender public.gender, p_show public.gender[])
returns void language plpgsql as $$
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (p_id, 'test.user.' || right(p_id::text, 12) || '@srmist.edu.in', 'authenticated', 'authenticated', now());
  update public.account_private
    set terms_version = (select value ->> 'version' from public.app_config where key = 'current_terms_version'),
        terms_accepted_at = now(), institutional_email_verified_at = now(),
        date_of_birth = (current_date - interval '22 years 10 days')::date,
        profile_completed_at = now() - interval '30 days'
    where id = p_id;
  update public.profiles set display_name = 'Test User', hook = 'Hook', gender = p_gender where id = p_id;
  update public.preferences set show_me = p_show where user_id = p_id;
  insert into public.profile_photos (id, user_id, storage_path, blurred_path, position, status, source, width, height)
  values (p_id, p_id, p_id || '/' || p_id || '.jpg', p_id || '/' || p_id || '.jpg', 0, 'approved', 'camera', 1080, 1350);
end $$;

-- The fixture's own open appeal (other appeals may exist in the local database).
create function pg_temp.my_appeal() returns uuid language sql as $$
  select (a ->> 'id')::uuid from jsonb_array_elements(public.moderation_queue() -> 'appeals') a
  where a ->> 'user_id' = '000000f2-0000-4000-8000-000000000001' limit 1;
$$;

create function pg_temp.act(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

select pg_temp.mk('000000f2-0000-4000-8000-000000000001', 'woman', '{man}');   -- S, a student
select pg_temp.mk('000000f2-0000-4000-8000-000000000002', 'man', '{woman}');   -- T, a student
select pg_temp.mk('000000f2-0000-4000-8000-0000000000b1', 'woman', '{man}');   -- moderator
select pg_temp.mk('000000f2-0000-4000-8000-0000000000c1', 'woman', '{man}');   -- admin
insert into public.admin_roles (user_id, role) values
  ('000000f2-0000-4000-8000-0000000000b1', 'moderator'),
  ('000000f2-0000-4000-8000-0000000000c1', 'admin');
-- A pending photo for the moderator to see, and a flagged confirmed date for review.
insert into public.profile_photos (id, user_id, storage_path, blurred_path, position, status, source, width, height)
values ('000000f2-0000-4000-8000-0000000000f1', '000000f2-0000-4000-8000-000000000002',
        '000000f2-0000-4000-8000-000000000002/000000f2-0000-4000-8000-0000000000f1.jpg',
        '000000f2-0000-4000-8000-000000000002/000000f2-0000-4000-8000-0000000000f1.jpg', 1, 'pending', 'camera', 1080, 1350);
insert into public.date_rounds (id, user_a, user_b, source, status, closes_at, a_answer, b_answer,
                                a_answered_at, b_answered_at, confirmed_at, closed_at)
values ('000000f2-0000-4000-8000-0000000000d1', '000000f2-0000-4000-8000-000000000001',
        '000000f2-0000-4000-8000-000000000002', 'match', 'confirmed', now() + interval '6 days', true, true,
        now(), now(), now(), now()),
       ('000000f2-0000-4000-8000-0000000000d2', '000000f2-0000-4000-8000-000000000001',
        '000000f2-0000-4000-8000-000000000002', 'match', 'confirmed', now() + interval '6 days', true, true,
        now() - interval '2 days', now() - interval '2 days', now() - interval '2 days', now() - interval '2 days');
insert into public.date_review_flags (date_round_id, user_id, reason) values
  ('000000f2-0000-4000-8000-0000000000d1', '000000f2-0000-4000-8000-000000000001', 'same_pair_repeated'),
  ('000000f2-0000-4000-8000-0000000000d2', '000000f2-0000-4000-8000-000000000002', 'high_volume');
create temp table t (name text primary key, id uuid, n bigint);
grant all on t to authenticated;

-- ---------------------------------------------------------------- roles and refusals
set local role authenticated;
select pg_temp.act('000000f2-0000-4000-8000-000000000001');
select throws_ok($$select count(*) from public.appeals$$, '42501', null, 'the app cannot read appeals');
select is(public.get_my_admin_role() -> 'role', 'null'::jsonb, 'a student has no role');
select throws_ok($$select public.moderation_queue()$$, '42501', null, 'a student cannot open the queue');
select throws_ok($$select public.admin_find_account('test.user.000000000002@srmist.edu.in')$$, '42501', null,
  'nor look up an account');
select throws_ok($$select public.admin_account_detail('000000f2-0000-4000-8000-000000000002')$$, '42501', null,
  'nor read one');
select throws_ok($$select public.moderation_decide_appeal(gen_random_uuid(), true, 'x')$$, '42501', null,
  'nor decide an appeal');
select throws_ok($$select public.moderation_review_date_flag(1, true, 'x')$$, '42501', null, 'nor review dates');
select is(private.moderator_can_view_photo('profile-photos',
  '000000f2-0000-4000-8000-000000000002/000000f2-0000-4000-8000-0000000000f1.jpg'), false,
  'nor see a pending photo');

select pg_temp.act('000000f2-0000-4000-8000-0000000000b1');
select is(public.get_my_admin_role() ->> 'role', 'moderator', 'a moderator is told so');
select is(private.moderator_can_view_photo('profile-photos',
  '000000f2-0000-4000-8000-000000000002/000000f2-0000-4000-8000-0000000000f1.jpg'), true,
  'a moderator can see a pending photo to review it');
select is(private.moderator_can_view_photo('profile-photos', 'someone/else.jpg'), false,
  'but only files that belong to a photo');
select throws_ok($$select public.admin_list_plans()$$, '42501', null, 'a moderator cannot open plans');
select throws_ok($$select public.admin_update_plan('monthly', 19900, 25, true)$$, '42501', null, 'nor change one');
select throws_ok($$select public.admin_grant_likes('000000f2-0000-4000-8000-000000000001', 5, 'x')$$, '42501', null,
  'nor give likes');
select throws_ok($$select public.admin_grant_plan('000000f2-0000-4000-8000-000000000001', 'monthly', 'x')$$, '42501',
  null, 'nor a plan');
select throws_ok($$select public.admin_list_flags()$$, '42501', null, 'nor open flags');
select throws_ok($$select public.admin_set_flag('payments_open', 'false')$$, '42501', null, 'nor change one');
select pg_temp.act('000000f2-0000-4000-8000-0000000000c1');
select is(public.get_my_admin_role() ->> 'role', 'admin', 'an admin is told so');

-- ---------------------------------------------------------------- appeals
select pg_temp.act('000000f2-0000-4000-8000-000000000001');
select is(public.submit_appeal('please') ->> 'reason', 'not_restricted', 'an active account has nothing to appeal');
select pg_temp.act('000000f2-0000-4000-8000-0000000000b1');
select public.moderation_set_state('000000f2-0000-4000-8000-000000000001', 'suspended', 'community_rules', null);
select pg_temp.act('000000f2-0000-4000-8000-000000000001');
select is(public.submit_appeal('   ') ->> 'reason', 'invalid', 'an appeal needs words');
select is(public.submit_appeal('It was a misunderstanding.') ->> 'ok', 'true', 'a suspended person can appeal');
select is(public.submit_appeal('Again') ->> 'reason', 'already_open', 'once at a time');
select is(public.get_my_appeal() -> 'appeal' ->> 'status', 'open', 'and sees that it is pending');
select pg_temp.act('000000f2-0000-4000-8000-0000000000b1');
select ok(exists (select 1 from jsonb_array_elements(public.moderation_queue() -> 'appeals') a
                  where a ->> 'user_id' = '000000f2-0000-4000-8000-000000000001'
                    and a ->> 'message' = 'It was a misunderstanding.'), 'the appeal is in the queue');
select is(public.moderation_decide_appeal(
  pg_temp.my_appeal(), false, 'Upheld') ->> 'ok', 'true',
  'a moderator can keep the suspension');
reset role;
select is((select account_state::text from public.account_private where id = '000000f2-0000-4000-8000-000000000001'),
  'suspended', 'which stays');
set local role authenticated;
select pg_temp.act('000000f2-0000-4000-8000-000000000001');
select is(public.get_my_appeal() -> 'appeal' ->> 'status', 'upheld', 'and the person sees the answer');
select is(public.submit_appeal('Second try') ->> 'ok', 'true', 'they may ask again');
select pg_temp.act('000000f2-0000-4000-8000-0000000000b1');
select is(public.moderation_decide_appeal(
  pg_temp.my_appeal(), true, 'Restored') ->> 'ok', 'true',
  'or restore the account');
reset role;
select is((select account_state::text from public.account_private where id = '000000f2-0000-4000-8000-000000000001'),
  'active', 'which is active again');
select is((select count(*)::int from public.moderation_actions
           where target_user = '000000f2-0000-4000-8000-000000000001'
             and action in ('appeal_upheld', 'appeal_restored')), 2, 'both decisions are logged');
set local role authenticated;
select pg_temp.act('000000f2-0000-4000-8000-0000000000b1');
select public.moderation_set_state('000000f2-0000-4000-8000-000000000001', 'suspended', 'community_rules', null);
select pg_temp.act('000000f2-0000-4000-8000-000000000001');
select public.submit_appeal('Third');
select pg_temp.act('000000f2-0000-4000-8000-0000000000b1');
select public.moderation_decide_appeal(pg_temp.my_appeal(), false, 'Upheld');
select pg_temp.act('000000f2-0000-4000-8000-000000000001');
select is(public.submit_appeal('Fourth') ->> 'reason', 'too_many', 'three appeals in 30 days at most');
select pg_temp.act('000000f2-0000-4000-8000-0000000000b1');
select public.moderation_set_state('000000f2-0000-4000-8000-000000000001', 'active', null, null);

-- ---------------------------------------------------------------- flagged dates
select ok(exists (select 1 from jsonb_array_elements(public.moderation_queue() -> 'date_flags') f
                  where f ->> 'date_round_id' = '000000f2-0000-4000-8000-0000000000d1'), 'flagged dates are queued');
reset role;
insert into t (name, n) select 'flag1', id from public.date_review_flags
  where date_round_id = '000000f2-0000-4000-8000-0000000000d1';
insert into t (name, n) select 'flag2', id from public.date_review_flags
  where date_round_id = '000000f2-0000-4000-8000-0000000000d2';
set local role authenticated;
select is(public.moderation_review_date_flag((select n from t where name = 'flag1'), true, 'Not a real date') ->> 'ok',
  'true', 'a moderator can void a flagged date');
reset role;
select ok((select invalidated_at is not null from public.date_rounds where id = '000000f2-0000-4000-8000-0000000000d1'),
  'the date no longer counts');
select ok((select reviewed_at is not null from public.date_review_flags where id = (select n from t where name = 'flag1')),
  'and the flag is closed');
set local role authenticated;
select is(public.moderation_review_date_flag((select n from t where name = 'flag2'), false, 'Looks fine') ->> 'ok',
  'true', 'or clear a flag');
reset role;
select ok((select invalidated_at is null from public.date_rounds where id = '000000f2-0000-4000-8000-0000000000d2'),
  'leaving that date counted');
set local role authenticated;
select is(public.moderation_review_date_flag((select n from t where name = 'flag2'), false, 'Again') ->> 'reason',
  'not_found', 'a flag is reviewed once');

-- ---------------------------------------------------------------- accounts
select is(public.admin_find_account('TEST.USER.000000000002@srmist.edu.in') ->> 'id',
  '000000f2-0000-4000-8000-000000000002', 'an account is found by its exact email');
select is(public.admin_find_account('000000f2-0000-4000-8000-000000000002') ->> 'id',
  '000000f2-0000-4000-8000-000000000002', 'or its id');
select is(public.admin_find_account('Test User') ->> 'reason', 'invalid', 'never by name');
select is(public.admin_find_account('nobody@srmist.edu.in') ->> 'reason', 'not_found', 'an unknown address is not found');
select is((public.admin_account_detail('000000f2-0000-4000-8000-000000000002') ->> 'email'),
  'test.user.000000000002@srmist.edu.in', 'the account view shows its facts');
select is((public.admin_account_detail('000000f2-0000-4000-8000-000000000002') ->> 'age')::int, 22,
  'its age');
select ok(not (public.admin_account_detail('000000f2-0000-4000-8000-000000000002') ? 'date_of_birth'),
  'but not the birth date itself');
select is(jsonb_array_length(public.admin_account_detail('000000f2-0000-4000-8000-000000000002') -> 'photos'), 2,
  'and every photo, pending ones included');
reset role;
select ok((select count(*) from public.moderation_actions
           where moderator_id = '000000f2-0000-4000-8000-0000000000b1' and action = 'view_account') >= 1,
  'looking at an account is logged');
set local role authenticated;

-- ---------------------------------------------------------------- plans, grants, flags (admin)
select pg_temp.act('000000f2-0000-4000-8000-0000000000c1');
select ok(jsonb_array_length(public.admin_list_plans() -> 'plans') >= 7, 'an admin sees every plan');
select is(public.admin_update_plan('monthly', 50, 25, true) ->> 'reason', 'invalid', 'a price below one rupee is refused');
select is(public.admin_update_plan('nope', 19900, 25, true) ->> 'reason', 'not_found', 'an unknown plan is refused');
select is(public.admin_update_plan('monthly', 21900, 30, true) ->> 'ok', 'true', 'an admin can change a plan');
reset role;
select is((select price_paise from public.plans where id = 'monthly'), 21900, 'the price changes');
select ok(exists (select 1 from public.audit_events where action = 'plan_updated' and target_id = 'monthly'
                  and metadata -> 'before' ->> 'price_paise' = '19900'), 'with the old value kept in the log');
set local role authenticated;
select is(public.admin_grant_likes('000000f2-0000-4000-8000-000000000001', 0, 'x') ->> 'reason', 'invalid',
  'likes are granted one to a hundred at a time');
select is(public.admin_grant_likes('000000f2-0000-4000-8000-000000000001', 5, '') ->> 'reason', 'invalid',
  'always with a reason');
reset role;
insert into t (name, n) select 'before', private.swipe_balance('000000f2-0000-4000-8000-000000000001');
set local role authenticated;
select is((public.admin_grant_likes('000000f2-0000-4000-8000-000000000001', 5, 'Support case') ->> 'likes_left')::bigint,
  (select n + 5 from t where name = 'before'), 'an admin can give likes');
select is(public.admin_grant_plan('000000f2-0000-4000-8000-000000000001', 'nope', 'x') ->> 'reason', 'unknown_plan',
  'an unknown plan is refused');
select is(public.admin_grant_plan('000000f2-0000-4000-8000-000000000001', 'monthly', 'Paid, never arrived') ->> 'ok',
  'true', 'an admin can grant a plan');
reset role;
select ok(private.has_instant('000000f2-0000-4000-8000-000000000001'), 'which works like a bought one');
set local role authenticated;
select is(public.admin_set_flag('free_right_swipes', '10') ->> 'reason', 'unknown_flag',
  'owner-fixed rules are not flags');
select is(public.admin_set_flag('payments_open', '1') ->> 'reason', 'invalid', 'a switch takes true or false');
select is(public.admin_set_flag('hot_person_threshold', '0') ->> 'reason', 'invalid', 'a number stays in its range');
select is(public.admin_set_flag('hot_person_threshold', '2.5') ->> 'reason', 'invalid', 'and whole');
select is(public.admin_set_flag('report_daily_limit', '20') ->> 'ok', 'true', 'an admin can change a number');
select pg_temp.act('000000f2-0000-4000-8000-000000000001');
select is(public.instant_start(30) ->> 'ok', 'true', 'Instant Meet works while open');
select pg_temp.act('000000f2-0000-4000-8000-0000000000c1');
select is(public.admin_set_flag('instant_open', 'false') ->> 'ok', 'true', 'an admin can pause Instant Meet');
reset role;
select is((select count(*)::int from private.instant_presence where user_id = '000000f2-0000-4000-8000-000000000001'), 0,
  'which takes everyone waiting out of it');
set local role authenticated;
select pg_temp.act('000000f2-0000-4000-8000-000000000001');
select is(public.instant_start(30) ->> 'reason', 'closed', 'and nobody can turn it on');
reset role;
select ok(exists (select 1 from public.audit_events where action = 'flag_set' and target_id = 'instant_open'),
  'every flag change is logged');

select * from finish();
rollback;
