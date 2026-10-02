-- SOUL Phase 7: plans, the swipe credit ledger and metered right swipes
-- (spec v2 section 22, DECISIONS D-013, D-033, D-047).
--
-- Everything here is decided by the server. The app can read the catalog and its own
-- balance, and ask to like someone; it can never grant a plan, a credit or Instant access.

create type public.plan_kind as enum ('subscription', 'topup');
create type public.swipe_bucket as enum ('free', 'plan', 'topup');
create type public.ledger_entry as enum ('grant', 'consume', 'refund', 'reverse', 'expire');

------------------------------------------------------------------------------
-- plans: the catalog. Prices, quotas, periods and Instant inclusion live only here; the
-- app renders whatever it returns. Prices are in paise (the payment provider's unit).
------------------------------------------------------------------------------
create table public.plans (
  id text primary key,
  kind public.plan_kind not null,
  title text not null,
  price_paise integer not null,
  right_swipes integer not null,
  -- Subscriptions run for one period per purchase (no auto-renewal, C-27).
  period interval,
  -- How long one purchase lasts, in words ("1 week", "3 months").
  period_label text,
  includes_instant boolean not null default false,
  active boolean not null default true,
  sort_order smallint not null,
  constraint plan_price_positive check (price_paise > 0),
  constraint plan_swipes_positive check (right_swipes > 0),
  constraint plan_shape check (
    (kind = 'subscription') = (period is not null and period_label is not null)
  ),
  -- Top-ups never unlock Instant Meet (spec 22).
  constraint topup_no_instant check (kind = 'subscription' or not includes_instant)
);

alter table public.plans enable row level security;
alter table public.plans force row level security;
create policy plans_active_read on public.plans
  for select to authenticated
  using (active);
revoke all on public.plans from anon, authenticated;
grant select on public.plans to authenticated;

insert into public.plans
  (id, kind, title, price_paise, right_swipes, period, period_label, includes_instant, sort_order)
values
  ('weekly', 'subscription', 'Weekly', 6900, 15, interval '7 days', '1 week', false, 10),
  ('monthly', 'subscription', 'Monthly', 19900, 25, interval '1 month', '1 month', true, 20),
  ('quarter', 'subscription', '3 months', 24900, 50, interval '3 months', '3 months', true, 30),
  ('half_year', 'subscription', '6 months', 49900, 120, interval '6 months', '6 months', true, 40),
  ('topup_5', 'topup', '5 likes', 5000, 5, null, null, false, 110),
  ('topup_12', 'topup', '12 likes', 10000, 12, null, null, false, 120),
  ('topup_25', 'topup', '25 likes', 20000, 25, null, null, false, 130);

------------------------------------------------------------------------------
-- subscriptions: one row per bought plan period. No client access; the app reads its
-- plan through get_my_swipes().
------------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null references public.plans (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active',
  -- The purchase this period came from; unique, so a purchase activates once.
  source_key text not null unique,
  created_at timestamptz not null default now(),
  constraint subscription_status_valid check (status in ('active', 'refunded')),
  constraint subscription_period_valid check (ends_at > starts_at)
);
create index subscriptions_user_idx on public.subscriptions (user_id, ends_at);

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;
revoke all on public.subscriptions from anon, authenticated;

------------------------------------------------------------------------------
-- swipe_credit_ledger: append-only. A `grant` row is a lot of credits with its own validity
-- window; every other row draws from (or returns to) one lot. Balances are always computed
-- from these rows on the server.
------------------------------------------------------------------------------
create table public.swipe_credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entry public.ledger_entry not null,
  bucket public.swipe_bucket not null,
  delta integer not null,
  -- The lot this entry belongs to; null on the grant row itself.
  lot_id bigint references public.swipe_credit_ledger (id) on delete cascade,
  -- Grants only: plan lots end with the plan period; free and top-up lots never expire.
  valid_from timestamptz,
  expires_at timestamptz,
  subscription_id uuid references public.subscriptions (id) on delete cascade,
  -- Consume rows: who was liked.
  like_target uuid,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint ledger_grant_shape check (
    (entry = 'grant') = (lot_id is null) and (entry = 'grant') = (valid_from is not null)
  ),
  constraint ledger_grant_positive check (entry <> 'grant' or delta > 0),
  constraint ledger_consume_one check (entry <> 'consume' or (delta = -1 and like_target is not null)),
  constraint ledger_delta_nonzero check (delta <> 0)
);
create index swipe_credit_ledger_user_idx on public.swipe_credit_ledger (user_id) where entry = 'grant';
create index swipe_credit_ledger_lot_idx on public.swipe_credit_ledger (lot_id);

alter table public.swipe_credit_ledger enable row level security;
alter table public.swipe_credit_ledger force row level security;
revoke all on public.swipe_credit_ledger from anon, authenticated;

-- Rows are never edited, and are removed only together with the account they belong to.
create function private.ledger_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Depth 1 is a direct statement; deeper means a foreign-key cascade from the account.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'the swipe ledger is append-only' using errcode = '42501';
end;
$$;
create trigger swipe_credit_ledger_append_only
  before update or delete on public.swipe_credit_ledger
  for each row execute function private.ledger_is_append_only();

------------------------------------------------------------------------------
-- Free swipes are a one-time grant per SRMIST address (C-10), so deleting an account and
-- signing up again does not refill them. Only a fingerprint of the address is kept.
------------------------------------------------------------------------------
create table private.free_swipe_claims (
  email_fingerprint text primary key,
  claimed_at timestamptz not null default now()
);

create function private.ensure_free_swipes(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  quantity integer := (private.config_value('free_right_swipes') ->> 'quantity')::integer;
  address text;
begin
  if quantity is null or quantity <= 0 then
    return;
  end if;
  if exists (select 1 from public.swipe_credit_ledger where idempotency_key = 'free:' || p_user::text) then
    return;
  end if;
  select lower(btrim(email)) into address from auth.users where id = p_user;
  if address is null or address = '' then
    return;
  end if;
  insert into private.free_swipe_claims (email_fingerprint)
  values (encode(sha256(convert_to(address, 'UTF8')), 'hex'))
  on conflict do nothing;
  if not found then
    return;
  end if;
  insert into public.swipe_credit_ledger (user_id, entry, bucket, delta, valid_from, idempotency_key)
  values (p_user, 'grant', 'free', quantity, now(), 'free:' || p_user::text)
  on conflict (idempotency_key) do nothing;
end;
$$;
revoke all on function private.ensure_free_swipes(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Balance helpers.
------------------------------------------------------------------------------
-- Lots that are valid now and still have credits.
create function private.swipe_lots(p_user uuid)
returns table (lot_id bigint, bucket public.swipe_bucket, expires_at timestamptz, remaining integer)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.bucket, g.expires_at,
         (g.delta + coalesce((select sum(e.delta) from public.swipe_credit_ledger e where e.lot_id = g.id), 0))::integer
  from public.swipe_credit_ledger g
  where g.user_id = p_user
    and g.entry = 'grant'
    and g.valid_from <= now()
    and (g.expires_at is null or g.expires_at > now())
    and g.delta + coalesce((select sum(e.delta) from public.swipe_credit_ledger e where e.lot_id = g.id), 0) > 0;
$$;
revoke all on function private.swipe_lots(uuid) from public, anon, authenticated;

create function private.swipe_balance(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(remaining), 0)::integer from private.swipe_lots(p_user);
$$;
revoke all on function private.swipe_balance(uuid) from public, anon, authenticated;

-- One lock per account for everything that changes its credits.
create function private.lock_swipes(p_user uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('swipes:' || p_user::text, 0));
$$;
revoke all on function private.lock_swipes(uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- activate_plan: the only way a plan or top-up is granted. Called by the payment webhook
-- (Phase 12) with the verified payment id as the key, so a payment is granted exactly once.
-- A plan starts at once and runs beside any plan already active (D-047).
------------------------------------------------------------------------------
create function public.activate_plan(p_user uuid, p_plan text, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan public.plans%rowtype;
  subscription uuid;
  period_end timestamptz;
begin
  if p_user is null or p_plan is null or coalesce(btrim(p_key), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select * into plan from public.plans where id = p_plan and active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_plan');
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_user');
  end if;

  perform private.lock_swipes(p_user);
  if exists (select 1 from public.swipe_credit_ledger where idempotency_key = 'purchase:' || p_key) then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  if plan.kind = 'subscription' then
    period_end := now() + plan.period;
    insert into public.subscriptions (user_id, plan_id, starts_at, ends_at, source_key)
    values (p_user, plan.id, now(), period_end, p_key)
    returning id into subscription;
    insert into public.swipe_credit_ledger
      (user_id, entry, bucket, delta, valid_from, expires_at, subscription_id, idempotency_key)
    values
      (p_user, 'grant', 'plan', plan.right_swipes, now(), period_end, subscription, 'purchase:' || p_key);
  else
    insert into public.swipe_credit_ledger (user_id, entry, bucket, delta, valid_from, idempotency_key)
    values (p_user, 'grant', 'topup', plan.right_swipes, now(), 'purchase:' || p_key);
  end if;

  return jsonb_build_object('ok', true, 'replayed', false);
end;
$$;
revoke all on function public.activate_plan(uuid, text, text) from public, anon, authenticated;
grant execute on function public.activate_plan(uuid, text, text) to service_role;

------------------------------------------------------------------------------
-- get_my_swipes: the caller's balance, current plan and Instant entitlement.
------------------------------------------------------------------------------
create function public.get_my_swipes()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  current_plan jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not private.is_eligible(uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;
  perform private.ensure_free_swipes(uid);

  -- With more than one active plan, show the one that unlocks the most for the longest.
  select jsonb_build_object(
    'id', p.id, 'title', p.title, 'ends_at', s.ends_at, 'includes_instant', p.includes_instant)
  into current_plan
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.user_id = uid and s.status = 'active' and s.starts_at <= now() and s.ends_at > now()
  order by p.includes_instant desc, s.ends_at desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'balance', private.swipe_balance(uid),
    'buckets', (
      select jsonb_build_object(
        'free', coalesce(sum(remaining) filter (where bucket = 'free'), 0),
        'plan', coalesce(sum(remaining) filter (where bucket = 'plan'), 0),
        'topup', coalesce(sum(remaining) filter (where bucket = 'topup'), 0))
      from private.swipe_lots(uid)),
    'plan', current_plan,
    'instant', coalesce((current_plan ->> 'includes_instant')::boolean, false)
  );
end;
$$;
revoke all on function public.get_my_swipes() from public, anon;
grant execute on function public.get_my_swipes() to authenticated;

------------------------------------------------------------------------------
-- swipe_right, now metered. One transaction under the account's credit lock:
--   * a replay of the same request returns the first result and charges nothing
--   * liking someone already liked charges nothing
--   * a new like takes one credit from the lot that expires soonest (plan lots first,
--     then free, then top-ups, which never expire); with no credits, nothing is saved
-- Passes are never metered. Phase 8 adds the match to this transaction.
------------------------------------------------------------------------------
create or replace function public.swipe_right(p_target uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  previous public.likes%rowtype;
  lot bigint;
begin
  if viewer is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_target is null or p_idempotency_key is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  perform private.lock_swipes(viewer);

  select * into previous from public.likes where idempotency_key = p_idempotency_key;
  if found then
    if previous.liker_id <> viewer then
      return jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;
    return jsonb_build_object(
      'ok', true, 'liked', true, 'replayed', true, 'balance', private.swipe_balance(viewer));
  end if;

  if not private.can_view_profile(viewer, p_target) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  if exists (select 1 from public.likes where liker_id = viewer and target_id = p_target) then
    return jsonb_build_object(
      'ok', true, 'liked', true, 'replayed', true, 'balance', private.swipe_balance(viewer));
  end if;

  perform private.ensure_free_swipes(viewer);
  select l.lot_id into lot
  from private.swipe_lots(viewer) l
  order by l.expires_at nulls last, (l.bucket = 'topup'), l.lot_id
  limit 1;
  if lot is null then
    return jsonb_build_object('ok', false, 'reason', 'no_swipes', 'balance', 0);
  end if;

  insert into public.likes (liker_id, target_id, idempotency_key)
  values (viewer, p_target, p_idempotency_key);
  insert into public.swipe_credit_ledger
    (user_id, entry, bucket, delta, lot_id, like_target, idempotency_key)
  select viewer, 'consume', g.bucket, -1, g.id, p_target, 'like:' || p_idempotency_key::text
  from public.swipe_credit_ledger g where g.id = lot;
  delete from public.passes where passer_id = viewer and target_id = p_target;

  return jsonb_build_object(
    'ok', true, 'liked', true, 'replayed', false, 'balance', private.swipe_balance(viewer));
end;
$$;
