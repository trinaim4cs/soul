-- Phase 12: billing (spec 22, 23, 41; DECISIONS D-037, D-047, D-052).
-- Neutral identities only. Only this file's fixtures are counted.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(50);

create function pg_temp.mk(p_id uuid) returns void language plpgsql as $$
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (p_id, 'test.user.' || right(p_id::text, 12) || '@srmist.edu.in', 'authenticated', 'authenticated', now());
  update public.account_private
    set terms_version = (select value ->> 'version' from public.app_config where key = 'current_terms_version'),
        terms_accepted_at = now(),
        date_of_birth = (current_date - interval '22 years 10 days')::date,
        profile_completed_at = now() - interval '30 days'
    where id = p_id;
  update public.profiles set display_name = 'Test User', hook = 'Hook', gender = 'woman' where id = p_id;
end $$;

create function pg_temp.act(p_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.balance(p_id uuid) returns integer language sql security definer as $$
  select private.swipe_balance(p_id);
$$;

select pg_temp.mk('000000e0-0000-4000-8000-000000000001');   -- buyer
select pg_temp.mk('000000e0-0000-4000-8000-000000000002');   -- someone else
update public.app_config set value = 'true' where key = 'payments_allow_mock';

-- ---------------------------------------------------------------- nothing for the app to touch
set local role authenticated;
select pg_temp.act('000000e0-0000-4000-8000-000000000001');
select throws_ok($$select count(*) from public.payment_orders$$, '42501', null, 'the app cannot read orders');
select throws_ok($$select count(*) from public.payment_events$$, '42501', null, 'nor provider events');
select throws_ok($$select count(*) from public.payment_refunds$$, '42501', null, 'nor refunds');
select throws_ok($$select public.payment_create_order('000000e0-0000-4000-8000-000000000001', 'monthly', 'mock')$$,
  '42501', null, 'the app cannot create an order itself');
select throws_ok($$select public.payment_mark_paid(gen_random_uuid(), 'plink', 'pay', 19900, 'INR')$$,
  '42501', null, 'nor mark one paid');
select throws_ok($$select public.payment_mark_refunded('pay', 'rfnd', 100)$$, '42501', null, 'nor refund one');
select throws_ok($$select public.activate_plan('000000e0-0000-4000-8000-000000000001', 'monthly', 'free')$$,
  '42501', null, 'nor grant a plan');

-- ---------------------------------------------------------------- creating orders (server side)
reset role;
set local role service_role;
select is(public.payment_create_order('000000e0-0000-4000-8000-000000000001', 'nope', 'mock') ->> 'reason',
  'unknown_plan', 'only catalog items can be bought');
select is(public.payment_create_order('000000e0-0000-4000-8000-000000000001', 'monthly', 'stripe') ->> 'reason',
  'invalid', 'only known providers');
reset role;
update public.app_config set value = 'false' where key = 'payments_allow_mock';
set local role service_role;
select is(public.payment_create_order('000000e0-0000-4000-8000-000000000001', 'monthly', 'mock') ->> 'reason',
  'mock_not_allowed', 'the mock provider is refused unless the server allows it');
reset role;
update public.app_config set value = 'true' where key = 'payments_allow_mock';
set local role service_role;

create temp table o (name text primary key, id uuid);
grant all on o to service_role, authenticated;
insert into o select 'monthly', (public.payment_create_order('000000e0-0000-4000-8000-000000000001', 'monthly', 'mock') -> 'order' ->> 'id')::uuid;
select is((select amount_paise from public.payment_orders where id = (select id from o where name = 'monthly')), 19900,
  'the order freezes the catalog price');
select is(public.payment_attach_link((select id from o where name = 'monthly'), 'plink_m1', null) ->> 'ok', 'true',
  'the provider link is attached once');
select is(public.payment_attach_link((select id from o where name = 'monthly'), 'plink_other', null) ->> 'ok', 'false',
  'and cannot be swapped afterwards');

-- ---------------------------------------------------------------- what a payment must match
select is(public.payment_mark_paid((select id from o where name = 'monthly'), 'plink_m1', 'pay_m1', 100, 'INR') ->> 'reason',
  'mismatch', 'a smaller amount is refused');
select is((select status from public.payment_orders where id = (select id from o where name = 'monthly')), 'rejected',
  'and the order is rejected, not granted');
reset role;
select ok(exists (select 1 from public.audit_events where action = 'payment_rejected'
                  and target_id = (select id::text from o where name = 'monthly')), 'and recorded');
set local role service_role;

insert into o select 'monthly2', (public.payment_create_order('000000e0-0000-4000-8000-000000000001', 'monthly', 'mock') -> 'order' ->> 'id')::uuid;
select public.payment_attach_link((select id from o where name = 'monthly2'), 'plink_m2', null);
select is(public.payment_mark_paid((select id from o where name = 'monthly2'), 'plink_wrong', 'pay_m2', 19900, 'INR') ->> 'reason',
  'mismatch', 'a payment for another link is refused');
insert into o select 'monthly3', (public.payment_create_order('000000e0-0000-4000-8000-000000000001', 'monthly', 'mock') -> 'order' ->> 'id')::uuid;
select public.payment_attach_link((select id from o where name = 'monthly3'), 'plink_m3', null);
select is(public.payment_mark_paid((select id from o where name = 'monthly3'), 'plink_m3', 'pay_m3', 19900, 'USD') ->> 'reason',
  'mismatch', 'a payment in another currency is refused');

-- A price change after the order does not change what the order costs.
insert into o select 'monthly4', (public.payment_create_order('000000e0-0000-4000-8000-000000000001', 'monthly', 'mock') -> 'order' ->> 'id')::uuid;
select public.payment_attach_link((select id from o where name = 'monthly4'), 'plink_m4', null);
reset role;
update public.plans set price_paise = 29900 where id = 'monthly';
select is(pg_temp.balance('000000e0-0000-4000-8000-000000000001'), 0, 'no likes before paying');
set local role service_role;

-- ---------------------------------------------------------------- paying grants, once
select is(public.payment_mark_paid((select id from o where name = 'monthly4'), 'plink_m4', 'pay_m4', 19900, 'INR') ->> 'granted',
  'true', 'the price at order time is what counts');
reset role;
update public.plans set price_paise = 19900 where id = 'monthly';
select is(pg_temp.balance('000000e0-0000-4000-8000-000000000001'), 25, 'the plan''s likes are granted');
select ok(private.has_instant('000000e0-0000-4000-8000-000000000001'), 'and Instant Meet with it');
set local role service_role;
select is(public.payment_mark_paid((select id from o where name = 'monthly4'), 'plink_m4', 'pay_m4', 19900, 'INR') ->> 'ok',
  'true', 'the same payment reported again is accepted');
select is(public.payment_mark_paid((select id from o where name = 'monthly4'), 'plink_m4', 'pay_other', 19900, 'INR') ->> 'ok',
  'false', 'a different payment for a paid order is not');
reset role;
select is(pg_temp.balance('000000e0-0000-4000-8000-000000000001'), 25, 'and nothing is granted twice');
select is((select count(*)::int from public.subscriptions where user_id = '000000e0-0000-4000-8000-000000000001'), 1,
  'one plan period');
set local role service_role;

-- A link reported expired, then paid (webhooks can arrive out of order): the payment wins.
insert into o select 'topup', (public.payment_create_order('000000e0-0000-4000-8000-000000000001', 'topup_12', 'mock') -> 'order' ->> 'id')::uuid;
select public.payment_attach_link((select id from o where name = 'topup'), 'plink_t1', null);
select is(public.payment_mark_closed('plink_t1', 'expired') ->> 'changed', 'true', 'a link can expire unpaid');
select is(public.payment_mark_paid((select id from o where name = 'topup'), 'plink_t1', 'pay_t1', 10000, 'INR') ->> 'granted',
  'true', 'a payment that arrives after the expiry still counts');
reset role;
select is(pg_temp.balance('000000e0-0000-4000-8000-000000000001'), 37, 'the top-up is added');
set local role service_role;
select is(public.payment_mark_closed('plink_t1', 'cancelled') ->> 'changed', 'false',
  'a paid order cannot be closed afterwards');

-- ---------------------------------------------------------------- the owner's view
reset role;
set local role authenticated;
select pg_temp.act('000000e0-0000-4000-8000-000000000001');
select is(public.get_payment((select id from o where name = 'monthly4')) -> 'payment' ->> 'status', 'paid',
  'the buyer sees their payment');
select ok(not ((public.get_payment((select id from o where name = 'monthly4')) -> 'payment') ?| array['provider_payment_id', 'provider_link_id', 'user_id']),
  'without provider references');
select is(jsonb_array_length(public.get_my_payments() -> 'payments'), 5, 'and their whole history');
select pg_temp.act('000000e0-0000-4000-8000-000000000002');
select is(public.get_payment((select id from o where name = 'monthly4')) ->> 'reason', 'not_found',
  'nobody else can see it');

-- ---------------------------------------------------------------- likes used, then a refund
select pg_temp.act('000000e0-0000-4000-8000-000000000001');
reset role;
-- Five likes from the plan's lot (written directly: who is liked does not matter here).
insert into public.swipe_credit_ledger (user_id, entry, bucket, delta, lot_id, like_target, idempotency_key)
select '000000e0-0000-4000-8000-000000000001', 'consume', 'plan', -1, g.id, '000000e0-0000-4000-8000-000000000002',
       'test-consume-' || n
from public.swipe_credit_ledger g, generate_series(1, 5) n
where g.idempotency_key = 'purchase:mock:pay_m4';
select is(pg_temp.balance('000000e0-0000-4000-8000-000000000001'), 32, 'five likes used');
set local role service_role;
select is(public.payment_mark_refunded('pay_m4', 'rfnd_1', 5000) ->> 'revoked', 'false',
  'a partial refund does not take the plan away');
reset role;
select ok(private.has_instant('000000e0-0000-4000-8000-000000000001'), 'Instant Meet stays after a partial refund');
set local role service_role;
select is(public.payment_mark_refunded('pay_m4', 'rfnd_1', 5000) ->> 'replayed', 'true',
  'the same refund reported again changes nothing');
select is(public.payment_mark_refunded('pay_m4', 'rfnd_2', 14900) ->> 'revoked', 'true',
  'once fully refunded, the purchase is revoked');
reset role;
select is(pg_temp.balance('000000e0-0000-4000-8000-000000000001'), 12,
  'the plan''s 20 unused likes are gone; the top-up stays');
select ok(not private.has_instant('000000e0-0000-4000-8000-000000000001'), 'and Instant Meet with the plan');
select is((select status from public.subscriptions where source_key = 'mock:pay_m4'), 'refunded', 'the period is marked refunded');
select is((select status from public.payment_orders where id = (select id from o where name = 'monthly4')), 'refunded',
  'and so is the order');
select is((select count(*)::int from public.swipe_credit_ledger where idempotency_key like 'test-consume-%'), 5,
  'likes already used stay used');
set local role service_role;
select is(public.payment_mark_refunded('pay_m4', 'rfnd_3', 19900) ->> 'replayed', 'true',
  'a further refund event after revocation is harmless');
select is(public.payment_mark_refunded('pay_t1', 'rfnd_t1', 10000) ->> 'revoked', 'true', 'a top-up can be refunded');
reset role;
select is(pg_temp.balance('000000e0-0000-4000-8000-000000000001'), 0, 'which removes its likes too');

-- ---------------------------------------------------------------- limits and events
update public.app_config set value = '1' where key = 'payments_max_open_orders';
set local role service_role;
select public.payment_create_order('000000e0-0000-4000-8000-000000000002', 'weekly', 'mock');
select is(public.payment_create_order('000000e0-0000-4000-8000-000000000002', 'weekly', 'mock') ->> 'reason',
  'too_many_open', 'unpaid orders per account are limited');
select ok(public.payment_record_event('evt_test_1', 'razorpay', 'paid', null, '{}'), 'a provider event is recorded');
select ok(not public.payment_record_event('evt_test_1', 'razorpay', 'paid', null, '{}'), 'once');

select * from finish();
rollback;
