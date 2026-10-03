-- SOUL Phase 10: Instant Meet hardening against location probing (DECISIONS D-050).
--
-- A device reports its own position, so a modified app can report any position. Without
-- limits, someone could move a fake position around and watch who appears in their candidate
-- list, narrowing another person down to a few metres (trilateration). Three limits:
--   * the 1 km candidate test compares positions snapped to a 0.001-degree grid (about
--     110 m), so the answer never changes within a grid cell and the boundary only reveals
--     the cell
--   * at most one position every few seconds
--   * a position that implies an impossible jump from the last usable one is refused
-- Distances inside a session, after both people accepted, still use the exact positions
-- and are only ever returned rounded.

insert into public.app_config (key, value, client_visible, description) values
  ('instant_grid_degrees', '0.001', false, 'Grid used for the 1 km candidate test (about 110 m).'),
  ('instant_fix_min_interval_seconds', '2', false, 'Minimum time between two reported positions.'),
  ('instant_max_speed_mps', '20', false, 'Fastest plausible movement between two positions.')
on conflict (key) do nothing;

alter table private.instant_presence add column area extensions.geography(Point, 4326);
create index instant_presence_area_idx on private.instant_presence using gist (area);

/** The grid cell of a usable position: same freshness and accuracy rules as instant_fix. */
create function private.instant_area(p_user uuid)
returns extensions.geography
language sql
stable
security definer
set search_path = ''
as $$
  select area from private.instant_presence
  where user_id = p_user
    and active_until > now()
    and area is not null
    and located_at > now() - make_interval(
      secs => coalesce((private.config_value('instant_fix_max_age_seconds'))::int, 90))
    and accuracy_m <= coalesce((private.config_value('instant_fix_max_accuracy_m'))::int, 200);
$$;
revoke all on function private.instant_area(uuid) from public, anon, authenticated;

create or replace function public.instant_update_location(
  p_latitude double precision, p_longitude double precision, p_accuracy double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  previous private.instant_presence%rowtype;
  point extensions.geometry;
  grid double precision := coalesce((private.config_value('instant_grid_degrees'))::double precision, 0.001);
  min_interval integer := coalesce((private.config_value('instant_fix_min_interval_seconds'))::int, 2);
  max_speed double precision := coalesce((private.config_value('instant_max_speed_mps'))::double precision, 20);
  max_accuracy integer := coalesce((private.config_value('instant_fix_max_accuracy_m'))::int, 200);
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_latitude is null or p_longitude is null or p_accuracy is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
     or p_accuracy < 0 or p_accuracy > 100000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into previous from private.instant_presence
    where user_id = uid and active_until > now()
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;
  if previous.located_at > now() - make_interval(secs => min_interval) then
    return jsonb_build_object('ok', false, 'reason', 'too_soon');
  end if;

  point := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326);
  -- Compared with the last usable position of the last ten minutes: 150 m of slack for GPS
  -- noise, plus what the person could have travelled at the fastest plausible speed.
  if previous.location is not null
     and previous.located_at > now() - interval '10 minutes'
     and previous.accuracy_m <= max_accuracy
     and p_accuracy <= max_accuracy
     and extensions.st_distance(previous.location, point::extensions.geography)
         > 150 + max_speed * extract(epoch from now() - previous.located_at) then
    return jsonb_build_object('ok', false, 'reason', 'implausible');
  end if;

  update private.instant_presence
    set location = point::extensions.geography,
        area = extensions.st_snaptogrid(point, grid)::extensions.geography,
        accuracy_m = p_accuracy,
        located_at = now()
    where user_id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- Candidates: as before, but the 1 km test is between grid cells, never exact positions.
create or replace function private.instant_candidate_ids(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.user_id
  from private.instant_presence o
  where o.user_id <> p_user
    and private.instant_area(p_user) is not null
    and private.instant_area(o.user_id) is not null
    and extensions.st_dwithin(
      private.instant_area(p_user), o.area,
      coalesce((private.config_value('instant_radius_m'))::int, 1000))
    and private.has_instant(o.user_id)
    and private.instant_compatible(p_user, o.user_id)
    and (private.active_instant_session(o.user_id)).id is null
    and not exists (
      select 1 from private.instant_skips s where s.user_id = p_user and s.candidate_id = o.user_id);
$$;
