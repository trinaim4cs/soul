-- SOUL Phase 12: billing (spec 22, 23, 41; DECISIONS D-037, D-047, D-052).
--
-- Payments go through SOUL's own web checkout (Razorpay Payment Links). The rules:
--   * an order freezes the server catalog price when it is created; the app never sends one
--   * only the provider's signed webhook (or a server-side status check against the provider)
--     marks an order paid, and only after the amount and currency match the order
--   * paying grants through activate_plan() exactly once per provider payment
--   * a full refund revokes what is left of the purchase; nothing is granted on a return page
--   * the mock provider exists for development only and is refused unless the server allows it

insert into public.app_config (key, value, client_visible, description) values
  ('payments_open', 'true', true, 'Whether checkout is offered at all.'),
  ('payments_allow_mock', 'false', false,
   'Development only: allow the mock provider. Must stay false in production.'),
  ('payments_order_minutes', '20', false, 'How long a checkout link stays valid.'),
  ('payments_max_open_orders', '5', false, 'Unpaid orders one account may have at a time.')
on conflict (key) do nothing;

------------------------------------------------------------------------------
-- Orders and the webhook log. No client access; the owner reads through functions.
------------------------------------------------------------------------------
create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  -- Frozen from the catalog when the order is created.
  amount_paise integer not null,
  currency text not null default 'INR',
  provider text not null,
  provider_link_id text unique,
  checkout_url text,
  status text not null default 'created',
  provider_payment_id text unique,
  refunded_paise integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz,
  closed_at timestamptz,
  constraint payment_amount_positive check (amount_paise > 0),
  constraint payment_currency_inr check (currency = 'INR'),
  constraint payment_provider_valid check (provider in ('razorpay', 'mock')),
  constraint payment_status_valid check (status in ('created', 'paid', 'expired', 'cancelled', 'refunded', 'rejected')),
  constraint payment_paid_shape check ((status in ('paid', 'refunded')) = (paid_at is not null and provider_payment_id is not null)),
  constraint payment_refund_range check (refunded_paise between 0 and amount_paise)
);
create index payment_orders_user_idx on public.payment_orders (user_id, created_at desc);
alter table public.payment_orders enable row level security;
alter table public.payment_orders force row level security;
revoke all on public.payment_orders from anon, authenticated;

-- Every provider event once (idempotency), with ids and amounts only: no payer details.
create table public.payment_events (
  event_id text primary key,
  provider text not null,
  event_type text not null,
  order_id uuid references public.payment_orders (id) on delete set null,
  summary jsonb not null default '{}'::jsonb,
  result text,
  received_at timestamptz not null default now()
);
alter table public.payment_events enable row level security;
alter table public.payment_events force row level security;
revoke all on public.payment_events from anon, authenticated;

-- Refunds once each (a refund can arrive as several events).
create table public.payment_refunds (
  refund_id text primary key,
  order_id uuid not null references public.payment_orders (id) on delete cascade,
  amount_paise integer not null check (amount_paise > 0),
  created_at timestamptz not null default now()
);
alter table public.payment_refunds enable row level security;
alter table public.payment_refunds force row level security;
revoke all on public.payment_refunds from anon, authenticated;

create function private.payment_json(p_order public.payment_orders)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_order.id,
    'plan_id', p_order.plan_id,
    'title', (select title from public.plans where id = p_order.plan_id),
    'amount_paise', p_order.amount_paise,
    'status', case when p_order.status = 'created' and p_order.expires_at <= now() then 'expired'
                   else p_order.status end,
    'created_at', p_order.created_at,
    'paid_at', p_order.paid_at
  );
$$;
revoke all on function private.payment_json(public.payment_orders) from public, anon, authenticated;

------------------------------------------------------------------------------
-- payment_create_order (service role, called by the payments-checkout Edge Function).
------------------------------------------------------------------------------
create function public.payment_create_order(p_user uuid, p_plan text, p_provider text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.plans%rowtype;
  created public.payment_orders%rowtype;
  open_orders integer;
begin
  if p_user is null or p_plan is null or p_provider not in ('razorpay', 'mock') then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if not coalesce((private.config_value('payments_open'))::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;
  if p_provider = 'mock' and not coalesce((private.config_value('payments_allow_mock'))::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'mock_not_allowed');
  end if;
  if not private.is_eligible(p_user) then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;
  select * into plan from public.plans where id = p_plan and active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_plan');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('payments:' || p_user::text, 0));
  select count(*) into open_orders from public.payment_orders
    where user_id = p_user and status = 'created' and expires_at > now();
  if open_orders >= coalesce((private.config_value('payments_max_open_orders'))::int, 5) then
    return jsonb_build_object('ok', false, 'reason', 'too_many_open');
  end if;

  insert into public.payment_orders (user_id, plan_id, amount_paise, provider, expires_at)
  values (p_user, plan.id, plan.price_paise, p_provider,
          now() + make_interval(mins => coalesce((private.config_value('payments_order_minutes'))::int, 20)))
  returning * into created;
  return jsonb_build_object('ok', true, 'order', private.payment_json(created) ||
    jsonb_build_object('expires_at', created.expires_at, 'description', 'SOUL · ' || plan.title));
end;
$$;

create function public.payment_attach_link(p_order uuid, p_link_id text, p_url text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_orders set provider_link_id = p_link_id, checkout_url = p_url
    where id = p_order and status = 'created' and provider_link_id is null;
  return jsonb_build_object('ok', found);
end;
$$;

------------------------------------------------------------------------------
-- payment_mark_paid (service role): the only path to a grant. Idempotent per payment.
------------------------------------------------------------------------------
create function public.payment_mark_paid(
  p_order uuid, p_link_id text, p_payment_id text, p_amount integer, p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ord public.payment_orders%rowtype;
  granted jsonb;
begin
  if p_order is null or coalesce(p_payment_id, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select * into ord from public.payment_orders where id = p_order for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_order');
  end if;
  if ord.status in ('paid', 'refunded') then
    -- The same payment reported again is fine; a different one for a paid order is not.
    return jsonb_build_object('ok', ord.provider_payment_id = p_payment_id, 'reason', 'already_paid');
  end if;
  if ord.provider_link_id is distinct from p_link_id
     or p_amount is distinct from ord.amount_paise
     or p_currency is distinct from ord.currency then
    update public.payment_orders set status = 'rejected', closed_at = now() where id = ord.id;
    insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
    values (null, 'payment_rejected', 'payment_order', ord.id::text,
            jsonb_build_object('amount', p_amount, 'expected', ord.amount_paise, 'currency', p_currency));
    return jsonb_build_object('ok', false, 'reason', 'mismatch');
  end if;

  granted := public.activate_plan(ord.user_id, ord.plan_id, ord.provider || ':' || p_payment_id);
  if not coalesce((granted ->> 'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', granted ->> 'reason');
  end if;
  update public.payment_orders
    set status = 'paid', provider_payment_id = p_payment_id, paid_at = now(), closed_at = now()
    where id = ord.id;
  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (ord.user_id, 'payment_paid', 'payment_order', ord.id::text,
          jsonb_build_object('plan', ord.plan_id, 'amount', ord.amount_paise, 'provider', ord.provider));
  perform realtime.send(jsonb_build_object('reason', 'payment', 'order_id', ord.id), 'refresh',
                        'user:' || ord.user_id::text, true);
  return jsonb_build_object('ok', true, 'granted', true);
end;
$$;

------------------------------------------------------------------------------
-- payment_mark_refunded (service role). A full refund revokes what is left of the purchase:
-- the remaining likes of its lot, and the plan period itself. Likes already used stay used.
------------------------------------------------------------------------------
create function public.payment_mark_refunded(p_payment_id text, p_refund_id text, p_amount integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ord public.payment_orders%rowtype;
  total integer;
  lot record;
  key text;
begin
  if coalesce(p_payment_id, '') = '' or coalesce(p_refund_id, '') = '' or coalesce(p_amount, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select * into ord from public.payment_orders where provider_payment_id = p_payment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_payment');
  end if;
  insert into public.payment_refunds (refund_id, order_id, amount_paise) values (p_refund_id, ord.id, p_amount)
  on conflict (refund_id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;
  select least(coalesce(sum(amount_paise), 0), ord.amount_paise) into total
    from public.payment_refunds where order_id = ord.id;
  update public.payment_orders set refunded_paise = total where id = ord.id;

  if total < ord.amount_paise then
    insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
    values (null, 'payment_partially_refunded', 'payment_order', ord.id::text,
            jsonb_build_object('refunded', total, 'amount', ord.amount_paise));
    return jsonb_build_object('ok', true, 'revoked', false);
  end if;
  if ord.status = 'refunded' then
    return jsonb_build_object('ok', true, 'revoked', true, 'replayed', true);
  end if;

  key := ord.provider || ':' || p_payment_id;
  perform private.lock_swipes(ord.user_id);
  select g.id, g.delta + coalesce((select sum(e.delta) from public.swipe_credit_ledger e where e.lot_id = g.id), 0) as remaining
    into lot
    from public.swipe_credit_ledger g
    where g.idempotency_key = 'purchase:' || key and g.entry = 'grant';
  if lot.id is not null and lot.remaining > 0 then
    insert into public.swipe_credit_ledger (user_id, entry, bucket, delta, lot_id, idempotency_key)
    select ord.user_id, 'reverse', g.bucket, -lot.remaining, g.id, 'reverse:' || key
    from public.swipe_credit_ledger g where g.id = lot.id
    on conflict (idempotency_key) do nothing;
  end if;
  update public.subscriptions set status = 'refunded' where source_key = key and status = 'active';
  update public.payment_orders set status = 'refunded', closed_at = now() where id = ord.id;
  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (null, 'payment_refunded', 'payment_order', ord.id::text,
          jsonb_build_object('plan', ord.plan_id, 'revoked_likes', greatest(coalesce(lot.remaining, 0), 0)));
  perform realtime.send(jsonb_build_object('reason', 'payment', 'order_id', ord.id), 'refresh',
                        'user:' || ord.user_id::text, true);
  return jsonb_build_object('ok', true, 'revoked', true);
end;
$$;

-- The provider says a link expired or was cancelled (only while still unpaid).
create function public.payment_mark_closed(p_link_id text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('expired', 'cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  update public.payment_orders set status = p_status, closed_at = now()
    where provider_link_id = p_link_id and status = 'created';
  return jsonb_build_object('ok', true, 'changed', found);
end;
$$;

-- Records a provider event once. Returns false when it was already seen.
create function public.payment_record_event(
  p_event_id text, p_provider text, p_type text, p_order uuid, p_summary jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payment_events (event_id, provider, event_type, order_id, summary)
  values (p_event_id, p_provider, p_type, p_order, coalesce(p_summary, '{}'::jsonb))
  on conflict (event_id) do nothing;
  return found;
end;
$$;

create function public.payment_set_event_result(p_event_id text, p_result text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_events set result = left(p_result, 200) where event_id = p_event_id;
$$;

------------------------------------------------------------------------------
-- What the owner may read: their own orders, status only.
------------------------------------------------------------------------------
create function public.get_payment(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ord public.payment_orders%rowtype;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into ord from public.payment_orders where id = p_order and user_id = uid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'payment', private.payment_json(ord));
end;
$$;

create function public.get_my_payments()
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
  return jsonb_build_object('ok', true, 'payments', coalesce((
    select jsonb_agg(private.payment_json(o) order by o.created_at desc)
    from (select * from public.payment_orders
          where user_id = uid and (status <> 'created' or expires_at > now() - interval '1 day')
          order by created_at desc limit 30) o
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.payment_create_order(uuid, text, text) from public, anon, authenticated;
revoke all on function public.payment_attach_link(uuid, text, text) from public, anon, authenticated;
revoke all on function public.payment_mark_paid(uuid, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.payment_mark_refunded(text, text, integer) from public, anon, authenticated;
revoke all on function public.payment_mark_closed(text, text) from public, anon, authenticated;
revoke all on function public.payment_record_event(text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.payment_set_event_result(text, text) from public, anon, authenticated;
grant execute on function public.payment_create_order(uuid, text, text) to service_role;
grant execute on function public.payment_attach_link(uuid, text, text) to service_role;
grant execute on function public.payment_mark_paid(uuid, text, text, integer, text) to service_role;
grant execute on function public.payment_mark_refunded(text, text, integer) to service_role;
grant execute on function public.payment_mark_closed(text, text) to service_role;
grant execute on function public.payment_record_event(text, text, text, uuid, jsonb) to service_role;
grant execute on function public.payment_set_event_result(text, text) to service_role;

revoke all on function public.get_payment(uuid) from public, anon;
revoke all on function public.get_my_payments() from public, anon;
grant execute on function public.get_payment(uuid) to authenticated;
grant execute on function public.get_my_payments() to authenticated;
