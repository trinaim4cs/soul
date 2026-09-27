-- SOUL Phase 4 (spec v2): SRMIST email + OTP is the only verification (DECISIONS D-027),
-- self-declared 18+ date of birth (D-028), rules ticked first (D-029), server status.

------------------------------------------------------------------------------
-- Institutional domain gate: runs inside Supabase Auth before any user row exists.
-- Non-allowlisted emails can never create an account, whatever the client sends.
------------------------------------------------------------------------------
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
  email_domain text := split_part(email, '@', 2);
  allowed jsonb;
begin
  select value into allowed from public.app_config where key = 'allowed_email_domains';

  if email = '' or position('@' in email) = 0 or email_domain = ''
     or allowed is null or not (allowed ? email_domain) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'SOUL is only for SRMIST students. Use your SRMIST email.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
grant select on table public.app_config to supabase_auth_admin;

-- The hook runs as supabase_auth_admin, which may read only the allowlist row.
create policy app_config_auth_admin_read on public.app_config
  for select to supabase_auth_admin
  using (key = 'allowed_email_domains');

------------------------------------------------------------------------------
-- Zodiac, derived from the date of birth (spec v2 section 17). Tropical sign dates.
------------------------------------------------------------------------------
create function private.zodiac_for(dob date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when dob is null then null
    when (extract(month from dob) = 3 and extract(day from dob) >= 21) or (extract(month from dob) = 4 and extract(day from dob) <= 19) then 'aries'
    when (extract(month from dob) = 4 and extract(day from dob) >= 20) or (extract(month from dob) = 5 and extract(day from dob) <= 20) then 'taurus'
    when (extract(month from dob) = 5 and extract(day from dob) >= 21) or (extract(month from dob) = 6 and extract(day from dob) <= 20) then 'gemini'
    when (extract(month from dob) = 6 and extract(day from dob) >= 21) or (extract(month from dob) = 7 and extract(day from dob) <= 22) then 'cancer'
    when (extract(month from dob) = 7 and extract(day from dob) >= 23) or (extract(month from dob) = 8 and extract(day from dob) <= 22) then 'leo'
    when (extract(month from dob) = 8 and extract(day from dob) >= 23) or (extract(month from dob) = 9 and extract(day from dob) <= 22) then 'virgo'
    when (extract(month from dob) = 9 and extract(day from dob) >= 23) or (extract(month from dob) = 10 and extract(day from dob) <= 22) then 'libra'
    when (extract(month from dob) = 10 and extract(day from dob) >= 23) or (extract(month from dob) = 11 and extract(day from dob) <= 21) then 'scorpio'
    when (extract(month from dob) = 11 and extract(day from dob) >= 22) or (extract(month from dob) = 12 and extract(day from dob) <= 21) then 'sagittarius'
    when (extract(month from dob) = 12 and extract(day from dob) >= 22) or (extract(month from dob) = 1 and extract(day from dob) <= 19) then 'capricorn'
    when (extract(month from dob) = 1 and extract(day from dob) >= 20) or (extract(month from dob) = 2 and extract(day from dob) <= 18) then 'aquarius'
    else 'pisces'
  end;
$$;

create function private.current_terms_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select value ->> 'version' from public.app_config where key = 'current_terms_version';
$$;

revoke all on function private.zodiac_for(date) from public, anon, authenticated;
revoke all on function private.current_terms_version() from public, anon, authenticated;

------------------------------------------------------------------------------
-- accept_terms: records the rules/terms/privacy version the user ticked before sign-in.
------------------------------------------------------------------------------
create function public.accept_terms(p_version text)
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
  if p_version is distinct from private.current_terms_version() then
    return jsonb_build_object('ok', false, 'reason', 'outdated_terms');
  end if;
  update public.account_private
    set terms_version = p_version, terms_accepted_at = now()
    where id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

------------------------------------------------------------------------------
-- set_date_of_birth: once, 18+ only. Under-18 entries store no DOB and lock re-entry.
------------------------------------------------------------------------------
create function public.set_date_of_birth(p_dob date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  acct public.account_private%rowtype;
  lockout interval := interval '30 days';
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into acct from public.account_private where id = uid for update;

  if acct.date_of_birth is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_set');
  end if;
  if acct.age_gate_failed_at is not null and acct.age_gate_failed_at > now() - lockout then
    return jsonb_build_object('ok', false, 'reason', 'age_gate_locked');
  end if;
  if p_dob is null or p_dob > current_date or p_dob < (current_date - interval '100 years') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_date');
  end if;
  if p_dob > (current_date - interval '18 years') then
    -- Record only that the gate failed; a minor's date of birth is never stored.
    update public.account_private set age_gate_failed_at = now() where id = uid;
    return jsonb_build_object('ok', false, 'reason', 'underage');
  end if;

  update public.account_private set date_of_birth = p_dob where id = uid;
  return jsonb_build_object('ok', true, 'zodiac', private.zodiac_for(p_dob));
end;
$$;

------------------------------------------------------------------------------
-- get_my_status(): the single server-computed status the app routes on.
------------------------------------------------------------------------------
create function public.get_my_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    select * from public.account_private where id = (select auth.uid())
  ), s as (
    select
      a.account_state,
      a.institutional_email_verified_at is not null as email,
      a.terms_version is not null
        and a.terms_version = private.current_terms_version() as terms,
      a.date_of_birth is not null
        and a.date_of_birth <= (current_date - interval '18 years') as age,
      a.profile_completed_at is not null as profile,
      a.age_gate_failed_at is not null
        and a.age_gate_failed_at > now() - interval '30 days' as age_locked
    from a
  )
  select jsonb_build_object(
    'account_state', s.account_state,
    'eligibility', case when s.account_state = 'active' and s.email and s.terms and s.age and s.profile
                        then 'eligible' else 'incomplete' end,
    'steps', jsonb_build_object('email', s.email, 'terms', s.terms, 'age', s.age, 'profile', s.profile),
    'age_locked', s.age_locked,
    'current_terms_version', private.current_terms_version()
  )
  from s;
$$;

revoke all on function public.accept_terms(text) from public, anon;
revoke all on function public.set_date_of_birth(date) from public, anon;
revoke all on function public.get_my_status() from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
grant execute on function public.set_date_of_birth(date) to authenticated;
grant execute on function public.get_my_status() to authenticated;

------------------------------------------------------------------------------
-- Required configuration (every environment). Values are owner-managed afterwards.
------------------------------------------------------------------------------
insert into public.app_config (key, value, client_visible, description) values
  ('allowed_email_domains', '["srmist.edu.in"]', false,
   'Institutional email domains allowed to sign up (D-027). Add domains here; no APK needed.'),
  ('current_terms_version', '{"version": "2026-09-27-draft"}', true,
   'Rules/Terms/Privacy version users must tick (D-029). Draft texts until legal review (C-23).'),
  ('free_right_swipes', '{"quantity": 4, "resets": false}', true,
   'Free right swipes; one-time per the owner''s current answer, configurable (D-033).'),
  ('instant_radius_meters', '1000', false, 'Instant Meet candidate radius in metres (D-031).')
on conflict (key) do nothing;

------------------------------------------------------------------------------
-- Record the rules version ticked before sign-in, carried in sign-up metadata
-- (`accepted_terms_version`). Only the current version counts; anything else leaves the
-- terms step open so the app asks again after sign-in.
------------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ticked text := new.raw_user_meta_data ->> 'accepted_terms_version';
  current_version text := private.current_terms_version();
  accepted boolean := ticked is not null and ticked = current_version;
begin
  insert into public.account_private (id, institutional_email_verified_at, terms_version, terms_accepted_at)
  values (
    new.id,
    new.email_confirmed_at,
    case when accepted then ticked end,
    case when accepted then now() end
  );
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;
