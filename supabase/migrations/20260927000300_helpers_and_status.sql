-- SOUL Phase 3: shared security helpers, new-user provisioning, account status RPC.

------------------------------------------------------------------------------
-- Helpers (private schema, SECURITY DEFINER, pinned search_path).
------------------------------------------------------------------------------

-- True when either user has blocked the other (blocks are effective both ways).
create function private.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create function private.has_admin_role(uid uuid, minimum public.admin_role default 'moderator')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_roles r
    where r.user_id = uid
      and (minimum = 'moderator' or r.role = 'admin')
  );
$$;

revoke all on function private.is_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function private.has_admin_role(uuid, public.admin_role) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Provision account rows for every new auth user.
------------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_private (id, institutional_email_verified_at)
  values (new.id, new.email_confirmed_at);
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Mirror email confirmation (OTP verified) into the server-owned account state.
create function private.handle_user_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is distinct from new.email_confirmed_at then
    update public.account_private
      set institutional_email_verified_at = new.email_confirmed_at
      where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function private.handle_user_email_confirmed();
