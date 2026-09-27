-- SOUL Phase 6: discovery (spec v2 sections 18 to 21; DECISIONS D-042).
-- Location-independent. Candidates come only from server functions that apply eligibility,
-- two-way compatibility, blocks and privacy, and return a whitelisted projection. Other
-- users' photos are readable only through storage policies built on the same visibility
-- rule, and only as signed URLs.

------------------------------------------------------------------------------
-- likes and passes: written only by swipe_right / swipe_left.
------------------------------------------------------------------------------
create table public.likes (
  liker_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  primary key (liker_id, target_id),
  constraint no_self_like check (liker_id <> target_id)
);
create index likes_target_idx on public.likes (target_id);

create table public.passes (
  passer_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  passed_at timestamptz not null default now(),
  primary key (passer_id, target_id),
  constraint no_self_pass check (passer_id <> target_id)
);

alter table public.likes enable row level security;
alter table public.likes force row level security;
alter table public.passes enable row level security;
alter table public.passes force row level security;

create policy likes_liker_read on public.likes
  for select to authenticated using ((select auth.uid()) = liker_id);
create policy passes_passer_read on public.passes
  for select to authenticated using ((select auth.uid()) = passer_id);

revoke all on public.likes from anon, authenticated;
revoke all on public.passes from anon, authenticated;
grant select on public.likes to authenticated;
grant select on public.passes to authenticated;

insert into public.app_config (key, value, client_visible, description) values
  ('pass_cooldown_days', '30', false,
   'Days before a passed profile can appear in Discover again (D-042).'),
  ('discovery_new_profile_days', '7', false,
   'Profiles completed within this many days are shown first (D-042).')
on conflict (key) do nothing;

------------------------------------------------------------------------------
-- Helpers.
------------------------------------------------------------------------------
create function private.age_of(p_dob date)
returns integer
language sql
stable
set search_path = ''
as $$
  select extract(year from age(current_date, p_dob))::int;
$$;

-- The same rule get_my_status uses for "eligible" (a test keeps them in step).
create function private.is_eligible(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_private a
    where a.id = p_uid
      and a.account_state = 'active'
      and a.institutional_email_verified_at is not null
      and a.terms_version = private.current_terms_version()
      and a.date_of_birth is not null
      and a.date_of_birth <= (current_date - interval '18 years')
      and a.profile_completed_at is not null
  );
$$;

/**
 * Can p_viewer see p_candidate at all? Both eligible, not blocked either way, genders
 * compatible both ways, the viewer inside the candidate's age range (the candidate's
 * wishes), a main photo approved, and private candidates only to people they liked.
 * The viewer's own age and zodiac filters are feed filters, not visibility.
 */
create function private.can_view_profile(p_viewer uuid, p_candidate uuid)
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

/** Whitelisted card for another user: no email, date of birth, preferences or raw state. */
create function private.profile_card(p_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', case when p.privacy_mode = 'anonymous' then null else p.display_name end,
    'anonymous', p.privacy_mode = 'anonymous',
    'gender', p.gender,
    'age', private.age_of(a.date_of_birth),
    'verified', a.institutional_email_verified_at is not null,
    'hook', p.hook,
    'about', p.about,
    'zodiac', case when p.zodiac_visible then private.zodiac_for(a.date_of_birth) end,
    'hot_person', false,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bucket', case when p.privacy_mode = 'anonymous' then 'profile-photos-blurred' else 'profile-photos' end,
        'path', case when p.privacy_mode = 'anonymous' then ph.blurred_path else ph.storage_path end
      ) order by ph.position)
      from public.profile_photos ph
      where ph.user_id = p.id and ph.status = 'approved'
    ), '[]'::jsonb)
  )
  from public.profiles p
  join public.account_private a on a.id = p.id
  where p.id = p_uid;
$$;

/** Storage read rule for another user's photo object (signed URLs are issued under RLS). */
create function private.can_view_photo_object(p_bucket text, p_name text)
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
        (p_bucket = 'profile-photos' and ph.storage_path = p_name and p.privacy_mode <> 'anonymous')
        or (p_bucket = 'profile-photos-blurred' and ph.blurred_path = p_name)
      )
      and private.can_view_profile((select auth.uid()), ph.user_id)
  );
$$;

revoke all on function private.age_of(date) from public, anon, authenticated;
revoke all on function private.is_eligible(uuid) from public, anon, authenticated;
revoke all on function private.can_view_profile(uuid, uuid) from public, anon, authenticated;
revoke all on function private.profile_card(uuid) from public, anon, authenticated;
revoke all on function private.can_view_photo_object(text, text) from public, anon;
-- Storage evaluates its policies as the requesting user, so they may call this check.
grant usage on schema private to authenticated;
grant execute on function private.can_view_photo_object(text, text) to authenticated;

create policy profile_photos_viewer_select on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos' and private.can_view_photo_object(bucket_id, name));

create policy profile_photos_blurred_viewer_select on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos-blurred' and private.can_view_photo_object(bucket_id, name));

------------------------------------------------------------------------------
-- discovery_feed: the next candidates for the caller. No text search of any kind
-- (spec 19); the caller can only page forward, excluding cards already on screen.
------------------------------------------------------------------------------
create function public.discovery_feed(p_exclude uuid[] default '{}', p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  cooldown interval := make_interval(days => coalesce((private.config_value('pass_cooldown_days'))::int, 30));
  fresh interval := make_interval(days => coalesce((private.config_value('discovery_new_profile_days'))::int, 7));
  result jsonb;
begin
  if viewer is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not private.is_eligible(viewer) then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;

  with me as (
    select p.id, p.gender, a.date_of_birth, pr.show_me, pr.min_age, pr.max_age, pr.zodiac_filter
    from public.profiles p
    join public.account_private a on a.id = p.id
    join public.preferences pr on pr.user_id = p.id
    where p.id = viewer
  ), candidates as (
    select cp.id, ca.profile_completed_at
    from me
    join public.profiles cp on cp.id <> me.id
    join public.account_private ca on ca.id = cp.id
    join public.preferences cpr on cpr.user_id = cp.id
    where ca.account_state = 'active'
      and ca.institutional_email_verified_at is not null
      and ca.terms_version = private.current_terms_version()
      and ca.date_of_birth is not null
      and ca.date_of_birth <= (current_date - interval '18 years')
      and ca.profile_completed_at is not null
      -- Two-way compatibility.
      and cp.gender = any (me.show_me)
      and me.gender = any (cpr.show_me)
      and private.age_of(me.date_of_birth) between cpr.min_age and cpr.max_age
      -- The viewer's own filters.
      and private.age_of(ca.date_of_birth) between me.min_age and me.max_age
      and (
        me.zodiac_filter is null
        or cardinality(me.zodiac_filter) = 0
        or (cp.zodiac_visible and private.zodiac_for(ca.date_of_birth) = any (me.zodiac_filter))
      )
      -- Privacy, blocks, main photo.
      and (
        cp.privacy_mode <> 'private'
        or exists (select 1 from public.likes l where l.liker_id = cp.id and l.target_id = me.id)
      )
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = me.id and b.blocked_id = cp.id)
           or (b.blocker_id = cp.id and b.blocked_id = me.id)
      )
      and exists (
        select 1 from public.profile_photos ph
        where ph.user_id = cp.id and ph.position = 0 and ph.status = 'approved'
      )
      -- Already decided, or already on screen.
      and not exists (select 1 from public.likes l where l.liker_id = me.id and l.target_id = cp.id)
      and not exists (
        select 1 from public.passes s
        where s.passer_id = me.id and s.target_id = cp.id and s.passed_at > now() - cooldown
      )
      and not (cp.id = any (coalesce(p_exclude, '{}')))
    order by
      (ca.profile_completed_at > now() - fresh) desc,
      md5(me.id::text || cp.id::text || current_date::text)
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  )
  select coalesce(jsonb_agg(private.profile_card(c.id)), '[]'::jsonb) into result from candidates c;

  return jsonb_build_object('ok', true, 'cards', result);
end;
$$;

/** One card, for a profile opened directly (for example after the list reloads). */
create function public.get_profile_card(p_target uuid)
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
  if not private.can_view_profile(viewer, p_target) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  return jsonb_build_object('ok', true, 'card', private.profile_card(p_target));
end;
$$;

------------------------------------------------------------------------------
-- swipe_right / swipe_left. Phase 7 adds swipe credits to swipe_right; Phase 8 adds
-- the match. Replays with the same idempotency key return the first result.
------------------------------------------------------------------------------
create function public.swipe_right(p_target uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  previous public.likes%rowtype;
begin
  if viewer is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_target is null or p_idempotency_key is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into previous from public.likes where idempotency_key = p_idempotency_key;
  if found then
    if previous.liker_id <> viewer then
      return jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;
    return jsonb_build_object('ok', true, 'liked', true, 'replayed', true);
  end if;

  if not private.can_view_profile(viewer, p_target) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  insert into public.likes (liker_id, target_id, idempotency_key)
  values (viewer, p_target, p_idempotency_key)
  on conflict (liker_id, target_id) do nothing;
  delete from public.passes where passer_id = viewer and target_id = p_target;

  return jsonb_build_object('ok', true, 'liked', true, 'replayed', false);
end;
$$;

create function public.swipe_left(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
begin
  if viewer is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_target is null or not private.can_view_profile(viewer, p_target) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  insert into public.passes (passer_id, target_id) values (viewer, p_target)
  on conflict (passer_id, target_id) do update set passed_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.discovery_feed(uuid[], integer) from public, anon;
revoke all on function public.get_profile_card(uuid) from public, anon;
revoke all on function public.swipe_right(uuid, uuid) from public, anon;
revoke all on function public.swipe_left(uuid) from public, anon;
grant execute on function public.discovery_feed(uuid[], integer) to authenticated;
grant execute on function public.get_profile_card(uuid) to authenticated;
grant execute on function public.swipe_right(uuid, uuid) to authenticated;
grant execute on function public.swipe_left(uuid) to authenticated;
