-- SOUL: close the password and email-change paths around email + OTP (DECISIONS D-046).
--
-- Verification is the SRMIST email plus a one-time code, nothing else (D-027). Supabase Auth
-- still exposes password sign-up and sign-in and email changes to anyone with the
-- publishable key, so the server closes them:
--   1. Email confirmations are on (config.toml), so a password sign-up is never confirmed
--      without the code sent to the inbox.
--   2. The custom access token hook refuses every session issued by a password sign-in.
--   3. A trigger refuses moving an account to an email outside the allowed domains.

------------------------------------------------------------------------------
-- Allowed-domain check shared by the sign-up hook and the email-change guard.
------------------------------------------------------------------------------
create function private.email_domain_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select value from public.app_config where key = 'allowed_email_domains')
      ? split_part(lower(btrim(p_email)), '@', 2),
    false
  )
  and position('@' in coalesce(p_email, '')) > 0;
$$;
revoke all on function private.email_domain_allowed(text) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Custom access token hook: no session from a password.
------------------------------------------------------------------------------
create function public.hook_custom_access_token(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if event ->> 'authentication_method' = 'password' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'SOUL signs you in with a code sent to your SRMIST email.'
      )
    );
  end if;
  return jsonb_build_object('claims', event -> 'claims');
end;
$$;

revoke all on function public.hook_custom_access_token(jsonb) from public, anon, authenticated;
grant execute on function public.hook_custom_access_token(jsonb) to supabase_auth_admin;

------------------------------------------------------------------------------
-- Email changes stay inside the allowed domains. A new SRMIST address must still be
-- confirmed from both inboxes (double_confirm_changes).
------------------------------------------------------------------------------
create function private.guard_auth_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null
     and not private.email_domain_allowed(new.email) then
    raise exception 'email outside the allowed domains' using errcode = '42501';
  end if;
  if new.email_change is distinct from old.email_change and coalesce(new.email_change, '') <> ''
     and not private.email_domain_allowed(new.email_change) then
    raise exception 'email outside the allowed domains' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_auth_email_change() from public, anon, authenticated;

create trigger guard_auth_email_change
  before update of email, email_change on auth.users
  for each row execute function private.guard_auth_email_change();
