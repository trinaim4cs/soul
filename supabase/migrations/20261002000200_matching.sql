-- SOUL Phase 8: matching (spec v2 section 24, DECISIONS D-015, D-016, D-048).
--
-- A match exists only when both people have liked each other. It is created inside the like
-- transaction, under a lock on the pair, so two likes arriving together make exactly one
-- match and never charge twice. The app cannot create, edit or delete a match.

------------------------------------------------------------------------------
-- Anonymous mode after a match (D-016): the person chooses whether people they match with
-- see their name and photos. On by default; Discover always stays blurred.
------------------------------------------------------------------------------
alter table public.profiles add column reveal_on_match boolean not null default true;
grant update (reveal_on_match) on public.profiles to authenticated;

------------------------------------------------------------------------------
-- matches: one row per pair, ordered so a pair has exactly one row (D-015). Unmatching
-- keeps the row (inactive) so moderation evidence survives and the pair never rematches.
------------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- When each person first saw the match (drives the "new" marker and the reveal).
  a_seen_at timestamptz,
  b_seen_at timestamptz,
  active boolean not null default true,
  ended_at timestamptz,
  ended_by uuid,
  constraint match_pair_ordered check (user_a < user_b),
  constraint match_pair_unique unique (user_a, user_b),
  constraint match_end_shape check (active = (ended_at is null))
);
create index matches_user_a_idx on public.matches (user_a) where active;
create index matches_user_b_idx on public.matches (user_b) where active;

alter table public.matches enable row level security;
alter table public.matches force row level security;
revoke all on public.matches from anon, authenticated;

------------------------------------------------------------------------------
-- Helpers.
------------------------------------------------------------------------------
-- One lock per pair, the same whichever of the two asks.
create function private.lock_pair(p_one uuid, p_other uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(
    hashtextextended('pair:' || least(p_one, p_other)::text || ':' || greatest(p_one, p_other)::text, 0));
$$;
revoke all on function private.lock_pair(uuid, uuid) from public, anon, authenticated;

create function private.active_match(p_one uuid, p_other uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.matches
  where user_a = least(p_one, p_other) and user_b = greatest(p_one, p_other) and active;
$$;
revoke all on function private.active_match(uuid, uuid) from public, anon, authenticated;

/**
 * Discovery visibility, plus one rule: two people who unmatched no longer see each other at
 * all (not in Discover, where their likes already keep them out, and not by a direct request).
 */
create or replace function private.can_view_profile(p_viewer uuid, p_candidate uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null
    and p_viewer <> p_candidate
    and private.is_eligible(p_viewer)
    and private.is_eligible(p_candidate)
    and not private.is_blocked(p_viewer, p_candidate)
    and not exists (
      select 1 from public.matches m
      where m.user_a = least(p_viewer, p_candidate) and m.user_b = greatest(p_viewer, p_candidate)
        and not m.active
    )
    and exists (
      select 1
      from public.profiles vp
      join public.preferences vpr on vpr.user_id = vp.id
      join public.account_private va on va.id = vp.id
      cross join public.profiles cp
      join public.preferences cpr on cpr.user_id = cp.id
      where vp.id = p_viewer
        and cp.id = p_candidate
        and cp.gender = any (vpr.show_me)
        and vp.gender = any (cpr.show_me)
        and private.age_of(va.date_of_birth) between cpr.min_age and cpr.max_age
        and (
          cp.privacy_mode <> 'private'
          or exists (select 1 from public.likes l where l.liker_id = cp.id and l.target_id = vp.id)
        )
        and exists (
          select 1 from public.profile_photos ph
          where ph.user_id = cp.id and ph.position = 0 and ph.status = 'approved'
        )
    );
$$;

/**
 * Can p_viewer see p_other as a match? An active match, both accounts still eligible, and
 * no block either way. Discovery preferences no longer matter once two people have matched.
 */
create function private.can_view_match(p_viewer uuid, p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null
    and p_viewer <> p_other
    and private.active_match(p_viewer, p_other) is not null
    and private.is_eligible(p_viewer)
    and private.is_eligible(p_other)
    and not private.is_blocked(p_viewer, p_other);
$$;
revoke all on function private.can_view_match(uuid, uuid) from public, anon, authenticated;

/**
 * The whitelisted card, now with an optional reveal: for a match, an anonymous person's name
 * and original photos are shown if they allow it (`reveal_on_match`).
 */
create function private.profile_card(p_uid uuid, p_for_match boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', case when hidden.yes then null else p.display_name end,
    'anonymous', hidden.yes,
    'gender', p.gender,
    'age', private.age_of(a.date_of_birth),
    'verified', a.institutional_email_verified_at is not null,
    'hook', p.hook,
    'about', p.about,
    'zodiac', case when p.zodiac_visible then private.zodiac_for(a.date_of_birth) end,
    'hot_person', false,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bucket', case when hidden.yes then 'profile-photos-blurred' else 'profile-photos' end,
        'path', case when hidden.yes then ph.blurred_path else ph.storage_path end
      ) order by ph.position)
      from public.profile_photos ph
      where ph.user_id = p.id and ph.status = 'approved'
    ), '[]'::jsonb)
  )
  from public.profiles p
  join public.account_private a on a.id = p.id
  cross join lateral (
    select p.privacy_mode = 'anonymous' and not (p_for_match and p.reveal_on_match) as yes
  ) hidden
  where p.id = p_uid;
$$;
revoke all on function private.profile_card(uuid, boolean) from public, anon, authenticated;

create or replace function private.profile_card(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.profile_card(p_uid, false);
$$;

/**
 * Storage read rule, extended: a match can sign photos, and an anonymous person's originals
 * only when they allow the reveal. The path test comes first, so the visibility checks run
 * for one photo, not for every photo.
 */
create or replace function private.can_view_photo_object(p_bucket text, p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profile_photos ph
    join public.profiles p on p.id = ph.user_id
    where ph.status = 'approved'
      and (
        (p_bucket = 'profile-photos' and ph.storage_path = p_name)
        or (p_bucket = 'profile-photos-blurred' and ph.blurred_path = p_name)
      )
      and case
        when p_bucket = 'profile-photos' and p.privacy_mode = 'anonymous' then
          p.reveal_on_match and private.can_view_match((select auth.uid()), ph.user_id)
        else
          private.can_view_profile((select auth.uid()), ph.user_id)
          or private.can_view_match((select auth.uid()), ph.user_id)
      end
  );
$$;
create index profile_photos_storage_path_idx on public.profile_photos (storage_path);
create index profile_photos_blurred_path_idx on public.profile_photos (blurred_path);

/** The match between the caller and p_other, if the caller has not seen it yet. */
create function private.unseen_match(p_viewer uuid, p_other uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'person', private.profile_card(p_other, true))
  from public.matches m
  where m.user_a = least(p_viewer, p_other) and m.user_b = greatest(p_viewer, p_other)
    and m.active
    and (case when m.user_a = p_viewer then m.a_seen_at else m.b_seen_at end) is null;
$$;
revoke all on function private.unseen_match(uuid, uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- get_profile_card: a match is shown under the match rule (and reports its match id).
------------------------------------------------------------------------------
create or replace function public.get_profile_card(p_target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
begin
  if viewer is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if private.can_view_match(viewer, p_target) then
    return jsonb_build_object(
      'ok', true,
      'card', private.profile_card(p_target, true),
      'match_id', private.active_match(viewer, p_target));
  end if;
  if not private.can_view_profile(viewer, p_target) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  return jsonb_build_object('ok', true, 'card', private.profile_card(p_target));
end;
$$;

------------------------------------------------------------------------------
-- swipe_right, now with the match. Order of locks: the caller's credit lock, then the pair.
-- Two people liking each other at the same moment queue on the pair lock, so the second one
-- to run sees the first like and creates the single match.
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
  if p_target is null or p_idempotency_key is null or p_target = viewer then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  perform private.lock_swipes(viewer);
  perform private.lock_pair(viewer, p_target);

  select * into previous from public.likes where idempotency_key = p_idempotency_key;
  if found then
    if previous.liker_id <> viewer then
      return jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;
    return jsonb_build_object(
      'ok', true, 'liked', true, 'replayed', true, 'balance', private.swipe_balance(viewer),
      'match', private.unseen_match(viewer, previous.target_id));
  end if;

  if not private.can_view_profile(viewer, p_target) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  if exists (select 1 from public.likes where liker_id = viewer and target_id = p_target) then
    return jsonb_build_object(
      'ok', true, 'liked', true, 'replayed', true, 'balance', private.swipe_balance(viewer),
      'match', private.unseen_match(viewer, p_target));
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

  -- Mutual: the other person already liked the caller. One row per pair, ever.
  if exists (select 1 from public.likes where liker_id = p_target and target_id = viewer) then
    insert into public.matches (user_a, user_b)
    values (least(viewer, p_target), greatest(viewer, p_target))
    on conflict (user_a, user_b) do nothing;
  end if;

  return jsonb_build_object(
    'ok', true, 'liked', true, 'replayed', false, 'balance', private.swipe_balance(viewer),
    'match', private.unseen_match(viewer, p_target));
end;
$$;

------------------------------------------------------------------------------
-- Match list, one match, seen, unmatch.
------------------------------------------------------------------------------
create function public.get_my_matches()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not private.is_eligible(uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;
  return jsonb_build_object('ok', true, 'matches', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'created_at', m.created_at,
      'seen', (case when m.user_a = uid then m.a_seen_at else m.b_seen_at end) is not null,
      'person', private.profile_card(o.other, true)
    ) order by m.created_at desc)
    from public.matches m
    cross join lateral (select case when m.user_a = uid then m.user_b else m.user_a end as other) o
    where m.active and uid in (m.user_a, m.user_b) and private.can_view_match(uid, o.other)
  ), '[]'::jsonb));
end;
$$;

create function public.get_match(p_match uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  found_match jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', m.id,
    'created_at', m.created_at,
    'seen', (case when m.user_a = uid then m.a_seen_at else m.b_seen_at end) is not null,
    'person', private.profile_card(o.other, true))
  into found_match
  from public.matches m
  cross join lateral (select case when m.user_a = uid then m.user_b else m.user_a end as other) o
  where m.id = p_match and m.active and uid in (m.user_a, m.user_b)
    and private.can_view_match(uid, o.other);
  if found_match is null then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  return jsonb_build_object('ok', true, 'match', found_match);
end;
$$;

create function public.mark_match_seen(p_match uuid)
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
  update public.matches
    set a_seen_at = case when user_a = uid then coalesce(a_seen_at, now()) else a_seen_at end,
        b_seen_at = case when user_b = uid then coalesce(b_seen_at, now()) else b_seen_at end
    where id = p_match and uid in (user_a, user_b);
  return jsonb_build_object('ok', found);
end;
$$;

-- Either person can end a match. The row stays, inactive; they never see each other again
-- (their likes remain, so neither returns to the other's Discover).
create function public.unmatch(p_match uuid)
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
  if not exists (select 1 from public.matches where id = p_match and uid in (user_a, user_b)) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  update public.matches
    set active = false, ended_at = now(), ended_by = uid
    where id = p_match and active;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.get_my_matches() from public, anon;
revoke all on function public.get_match(uuid) from public, anon;
revoke all on function public.mark_match_seen(uuid) from public, anon;
revoke all on function public.unmatch(uuid) from public, anon;
grant execute on function public.get_my_matches() to authenticated;
grant execute on function public.get_match(uuid) to authenticated;
grant execute on function public.mark_match_seen(uuid) to authenticated;
grant execute on function public.unmatch(uuid) to authenticated;

------------------------------------------------------------------------------
-- get_my_profile: adds the reveal setting.
------------------------------------------------------------------------------
create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'hook', p.hook,
    'about', p.about,
    'gender', p.gender,
    'privacy_mode', p.privacy_mode,
    'reveal_on_match', p.reveal_on_match,
    'zodiac_visible', p.zodiac_visible,
    'zodiac', private.zodiac_for(a.date_of_birth),
    'age', case when a.date_of_birth is null then null
                else extract(year from age(current_date, a.date_of_birth))::int end,
    'verified', a.institutional_email_verified_at is not null,
    'complete', a.profile_completed_at is not null,
    'show_me', coalesce(to_jsonb(pr.show_me), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ph.id,
        'storage_path', ph.storage_path,
        'blurred_path', ph.blurred_path,
        'position', ph.position,
        'status', ph.status,
        'width', ph.width,
        'height', ph.height
      ) order by ph.position)
      from public.profile_photos ph where ph.user_id = p.id
    ), '[]'::jsonb)
  )
  from public.profiles p
  join public.account_private a on a.id = p.id
  left join public.preferences pr on pr.user_id = p.id
  where p.id = (select auth.uid());
$$;
