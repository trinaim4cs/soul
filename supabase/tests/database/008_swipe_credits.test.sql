-- Phase 7: plans, the swipe ledger and metered right swipes (DECISIONS D-013, D-033, D-047).
-- Neutral identities only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(45);

-- Test-local helper: an eligible account with one approved main photo.
create function pg_temp.mk(p_id uuid, p_gender public.gender, p_show public.gender[], p_email text default null)
returns void language plpgsql as $$
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (p_id, coalesce(p_email, 'test.user.' || right(p_id::text, 12) || '@srmist.edu.in'),
          'authenticated', 'authenticated', now());
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

select pg_temp.mk('00000070-0000-4000-8000-000000000001', 'woman', '{man}');  -- V viewer
select pg_temp.mk('00000070-0000-4000-8000-000000000002', 'woman', '{man}');  -- W second viewer
select pg_temp.mk(('00000070-0000-4000-8000-0000000000a' || n)::uuid, 'man', '{woman}')
from generate_series(1, 7) as n;                                               -- T1..T7 targets

-- ---------------------------------------------------------------- catalog (owner prices)
select is(
  (select jsonb_object_agg(id, jsonb_build_array(price_paise, right_swipes, includes_instant, period_label))
   from public.plans where active),
  '{"weekly": [6900, 15, false, "1 week"], "monthly": [19900, 25, true, "1 month"],
    "quarter": [24900, 50, true, "3 months"], "half_year": [49900, 120, true, "6 months"],
    "topup_5": [5000, 5, false, null], "topup_12": [10000, 12, false, null],
    "topup_25": [20000, 25, false, null]}'::jsonb,
  'the catalog holds the owner''s prices, swipes and Instant rules');
select throws_ok(
  $$insert into public.plans (id, kind, title, price_paise, right_swipes, includes_instant, sort_order)
    values ('topup_x', 'topup', 'x', 100, 1, true, 200)$$,
  '23514', null, 'a top-up can never include Instant Meet');

-- ---------------------------------------------------------------- as the viewer
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000070-0000-4000-8000-000000000001", "role": "authenticated"}';

select is((select count(*)::int from public.plans), 7, 'the app can read the catalog');
select throws_ok($$update public.plans set price_paise = 1$$, '42501', null, 'the app cannot change prices');
select throws_ok($$select count(*) from public.swipe_credit_ledger$$, '42501', null,
  'the app cannot read the ledger directly');
select throws_ok(
  $$insert into public.swipe_credit_ledger (user_id, entry, bucket, delta, valid_from, idempotency_key)
    values ('00000070-0000-4000-8000-000000000001', 'grant', 'topup', 100, now(), 'self')$$,
  '42501', null, 'the app cannot grant itself credits');
select throws_ok($$select count(*) from public.subscriptions$$, '42501', null,
  'the app cannot read or write subscriptions directly');
select throws_ok(
  $$select public.activate_plan('00000070-0000-4000-8000-000000000001', 'half_year', 'self')$$,
  '42501', null, 'the app cannot activate a plan itself');

select is(public.get_my_swipes() -> 'balance', '4'::jsonb, 'a new account gets 4 free right swipes');
select is(public.get_my_swipes() -> 'balance', '4'::jsonb, 'the free swipes are granted once');
select is(public.get_my_swipes() -> 'buckets', '{"free": 4, "plan": 0, "topup": 0}'::jsonb,
  'the balance is split by source');
select is(public.get_my_swipes() -> 'instant', 'false'::jsonb, 'no plan means no Instant Meet');

select is(public.swipe_right('00000070-0000-4000-8000-0000000000a1', '10000070-0000-4000-8000-000000000001')
          - 'replayed', '{"ok": true, "liked": true, "balance": 3}'::jsonb, 'a new like costs one swipe');
select is(public.swipe_right('00000070-0000-4000-8000-0000000000a1', '10000070-0000-4000-8000-000000000001'),
  '{"ok": true, "liked": true, "replayed": true, "balance": 3}'::jsonb,
  'replaying the same request charges nothing');
select is(public.swipe_right('00000070-0000-4000-8000-0000000000a1', '10000070-0000-4000-8000-000000000099')
          -> 'balance', '3'::jsonb, 'liking someone already liked charges nothing');
select is(public.swipe_left('00000070-0000-4000-8000-0000000000a2') ->> 'ok', 'true', 'a pass is recorded');
select is(public.get_my_swipes() -> 'balance', '3'::jsonb, 'passes are not metered');

select is(public.swipe_right('00000070-0000-4000-8000-0000000000a2', '10000070-0000-4000-8000-000000000002')
          -> 'balance', '2'::jsonb, 'second like');
select is(public.swipe_right('00000070-0000-4000-8000-0000000000a3', '10000070-0000-4000-8000-000000000003')
          -> 'balance', '1'::jsonb, 'third like');
select is(public.swipe_right('00000070-0000-4000-8000-0000000000a4', '10000070-0000-4000-8000-000000000004')
          -> 'balance', '0'::jsonb, 'fourth like uses the last free swipe');
select is(public.swipe_right('00000070-0000-4000-8000-0000000000a5', '10000070-0000-4000-8000-000000000005'),
  '{"ok": false, "reason": "no_swipes", "balance": 0}'::jsonb, 'with no swipes left, a like is refused');
select is((select count(*)::int from public.likes
           where liker_id = '00000070-0000-4000-8000-000000000001'), 4, 'a refused like is not saved');

-- ---------------------------------------------------------------- purchases (service role)
set local role service_role;
select is(public.activate_plan('00000070-0000-4000-8000-000000000001', 'topup_5', 'pay_1') ->> 'replayed',
  'false', 'a verified payment activates a top-up');
select is(public.activate_plan('00000070-0000-4000-8000-000000000001', 'topup_5', 'pay_1') ->> 'replayed',
  'true', 'the same payment is granted only once');
select is(public.activate_plan('00000070-0000-4000-8000-000000000001', 'gold', 'pay_x') ->> 'reason',
  'unknown_plan', 'an unknown plan is refused');
select is(public.activate_plan('00000070-0000-4000-8000-000000000001', 'monthly', 'pay_2') ->> 'ok',
  'true', 'a verified payment activates the monthly plan');

set local role authenticated;
select is(public.get_my_swipes() -> 'buckets', '{"free": 0, "plan": 25, "topup": 5}'::jsonb,
  'top-up and plan swipes add up');
select is(public.get_my_swipes() -> 'plan' ->> 'id', 'monthly', 'the current plan is reported');
select is(public.get_my_swipes() -> 'instant', 'true'::jsonb, 'the monthly plan unlocks Instant Meet');
select is(public.swipe_right('00000070-0000-4000-8000-0000000000a5', '10000070-0000-4000-8000-000000000005')
          -> 'balance', '29'::jsonb, 'likes work again after a purchase');
select is(public.get_my_swipes() -> 'buckets', '{"free": 0, "plan": 24, "topup": 5}'::jsonb,
  'plan swipes (which expire) are used before top-ups (which do not)');

-- ---------------------------------------------------------------- expiry and validity windows
reset role;
insert into public.subscriptions (id, user_id, plan_id, starts_at, ends_at, source_key) values
  ('20000070-0000-4000-8000-000000000001', '00000070-0000-4000-8000-000000000002', 'weekly',
   now() - interval '10 days', now() - interval '3 days', 'pay_old');
insert into public.swipe_credit_ledger
  (user_id, entry, bucket, delta, valid_from, expires_at, subscription_id, idempotency_key) values
  ('00000070-0000-4000-8000-000000000002', 'grant', 'plan', 15, now() - interval '10 days',
   now() - interval '3 days', '20000070-0000-4000-8000-000000000001', 'purchase:pay_old'),
  ('00000070-0000-4000-8000-000000000002', 'grant', 'topup', 12, now() - interval '10 days', null, null,
   'purchase:pay_old_topup');

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000070-0000-4000-8000-000000000002", "role": "authenticated"}';
select is(public.get_my_swipes() -> 'buckets', '{"free": 4, "plan": 0, "topup": 12}'::jsonb,
  'unused plan swipes end with the plan period; top-ups never expire');
select is(public.get_my_swipes() -> 'plan', 'null'::jsonb, 'an ended plan is no longer current');

set local role service_role;
select public.activate_plan('00000070-0000-4000-8000-000000000002', 'weekly', 'pay_3');
set local role authenticated;
select is(public.get_my_swipes() -> 'plan' ->> 'id', 'weekly', 'the weekly plan is current');
select is(public.get_my_swipes() -> 'instant', 'false'::jsonb, 'the weekly plan does not unlock Instant Meet');
set local role service_role;
select public.activate_plan('00000070-0000-4000-8000-000000000002', 'quarter', 'pay_4');
set local role authenticated;
select is(public.get_my_swipes() -> 'buckets' -> 'plan', '65'::jsonb,
  'a second plan runs beside the first; nothing is forfeited');
select is(public.get_my_swipes() -> 'plan' ->> 'id', 'quarter', 'the plan with Instant Meet is shown as current');

-- ---------------------------------------------------------------- ledger integrity
reset role;
select is((select count(*)::int from public.swipe_credit_ledger
           where user_id = '00000070-0000-4000-8000-000000000001' and entry = 'consume'), 5,
  'every charged like has a ledger row');
select throws_ok($$update public.swipe_credit_ledger set delta = 99$$, '42501', null,
  'ledger rows cannot be edited, even by the database owner');
select throws_ok($$delete from public.swipe_credit_ledger$$, '42501', null, 'ledger rows cannot be deleted');

-- ---------------------------------------------------------------- free swipes: once per address
select pg_temp.mk('00000070-0000-4000-8000-000000000003', 'woman', '{man}', 'returning.user@srmist.edu.in');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000070-0000-4000-8000-000000000003", "role": "authenticated"}';
select is(public.get_my_swipes() -> 'balance', '4'::jsonb, 'first account on an address gets the free swipes');
reset role;
select lives_ok($$delete from auth.users where id = '00000070-0000-4000-8000-000000000003'$$,
  'deleting an account removes its ledger rows');
select pg_temp.mk('00000070-0000-4000-8000-000000000004', 'woman', '{man}', 'Returning.User@srmist.edu.in');
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000070-0000-4000-8000-000000000004", "role": "authenticated"}';
select is(public.get_my_swipes() -> 'balance', '0'::jsonb,
  'signing up again with the same address does not refill the free swipes');

-- ---------------------------------------------------------------- configuration and eligibility
reset role;
update public.app_config set value = '{"quantity": 2, "resets": false}' where key = 'free_right_swipes';
select pg_temp.mk('00000070-0000-4000-8000-000000000005', 'woman', '{man}');
update public.account_private set profile_completed_at = null where id = '00000070-0000-4000-8000-000000000005';
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000070-0000-4000-8000-000000000005", "role": "authenticated"}';
select is(public.get_my_swipes() ->> 'reason', 'not_eligible', 'an unfinished account has no swipe balance');
reset role;
update public.account_private set profile_completed_at = now() where id = '00000070-0000-4000-8000-000000000005';
set local role authenticated;
select is(public.get_my_swipes() -> 'balance', '2'::jsonb, 'the free quantity comes from server configuration');

select * from finish();
rollback;
