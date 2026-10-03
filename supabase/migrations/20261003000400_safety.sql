-- SOUL Phase 13: safety and moderation (spec 42, 43, 45, 67; DECISIONS D-019, D-053).
--
--   * block: everything between the two ends at once (match, chat, Instant Meet, pending
--     dates) and the blocked person is never told; it looks like an ordinary unmatch
--   * report: nine categories; the recent messages between the two are kept as evidence, and
--     the report survives the account through a one-way email fingerprint
--   * moderation (moderators only): suspend, ban, restore, review photos, resolve reports.
--     A ban also stops the same email from signing up again
--   * account deletion: everything about the person goes at once; purchase and safety records
--     stay, without the account
--   * retention: an hourly job ends timed suspensions and removes what the policy says to remove

insert into public.app_config (key, value, client_visible, description) values
  ('report_daily_limit', '10', false, 'Reports one account may file in 24 hours.'),
  ('retention_instant_days', '90', false, 'Instant Meet session records are kept this long (C-29).'),
  ('retention_safety_days', '365', false, 'Resolved reports and ban fingerprints are kept this long (C-29).'),
  ('retention_unpaid_order_days', '30', false, 'Unpaid checkout orders are kept this long.')
on conflict (key) do nothing;

------------------------------------------------------------------------------
-- Records that must outlive an account (purchases, Instant Meet safety records) keep their
-- rows when the person is deleted; only the link to the account goes.
------------------------------------------------------------------------------
alter table public.payment_orders alter column user_id drop not null;
alter table public.payment_orders drop constraint payment_orders_user_id_fkey,
  add constraint payment_orders_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;
alter table public.instant_sessions alter column user_a drop not null, alter column user_b drop not null;
alter table public.instant_sessions drop constraint instant_sessions_user_a_fkey,
  add constraint instant_sessions_user_a_fkey foreign key (user_a) references auth.users (id) on delete set null;
alter table public.instant_sessions drop constraint instant_sessions_user_b_fkey,
  add constraint instant_sessions_user_b_fkey foreign key (user_b) references auth.users (id) on delete set null;

-- What the restricted screen may say: until when, and a short reason category.
alter table public.account_private
  add column restricted_until timestamptz,
  add column restriction_reason text,
  add constraint restriction_reason_valid check (
    restriction_reason is null or restriction_reason in ('community_rules', 'fake_account', 'underage', 'safety', 'other'));

------------------------------------------------------------------------------
-- Fingerprints: a one-way hash of the lower-cased address, never the address itself.
------------------------------------------------------------------------------
create function private.email_fingerprint(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8'), 'sha256'), 'hex');
$$;
revoke all on function private.email_fingerprint(text) from public, anon, authenticated;

create function private.user_fingerprint(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.email_fingerprint(email) from auth.users where id = p_user;
$$;
revoke all on function private.user_fingerprint(uuid) from public, anon, authenticated;

-- Banned addresses, so a banned person cannot simply sign up again (kept per C-29).
create table private.banned_emails (
  fingerprint text primary key,
  banned_at timestamptz not null default now(),
  reason text
);

------------------------------------------------------------------------------
-- Reports and moderation actions. No client access to either table.
------------------------------------------------------------------------------
create type public.report_category as enum (
  'harassment', 'fake_account', 'impersonation', 'threat', 'stalking',
  'explicit_content', 'spam', 'underage', 'other');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  reported_id uuid references auth.users (id) on delete set null,
  -- Survives the reported account being deleted (the evidence for a ban or a legal request).
  reported_fingerprint text not null,
  category public.report_category not null,
  details text,
  context text not null,
  -- The recent messages between the two at the time of the report, as moderators will see them.
  evidence jsonb not null default '{}'::jsonb,
  priority boolean not null default false,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  resolution text,
  constraint report_details_length check (details is null or char_length(details) <= 1000),
  constraint report_context_valid check (context in ('profile', 'chat', 'instant', 'discovery')),
  constraint report_status_valid check (status in ('open', 'actioned', 'dismissed')),
  constraint report_resolved_shape check ((status = 'open') = (resolved_at is null))
);
create index reports_open_idx on public.reports (priority desc, created_at) where status = 'open';
create index reports_reported_idx on public.reports (reported_id, created_at desc);
create index reports_reporter_idx on public.reports (reporter_id, created_at desc);
alter table public.reports enable row level security;
alter table public.reports force row level security;
revoke all on public.reports from anon, authenticated;

create table public.moderation_actions (
  id bigint generated always as identity primary key,
  moderator_id uuid references auth.users (id) on delete set null,
  target_user uuid references auth.users (id) on delete set null,
  target_fingerprint text,
  action text not null,
  reason text,
  report_id uuid references public.reports (id) on delete set null,
  photo_id uuid,
  created_at timestamptz not null default now(),
  constraint moderation_action_valid check (action in (
    'suspend', 'ban', 'restore', 'approve_photo', 'reject_photo', 'resolve_report', 'dismiss_report'))
);
alter table public.moderation_actions enable row level security;
alter table public.moderation_actions force row level security;
revoke all on public.moderation_actions from anon, authenticated;

------------------------------------------------------------------------------
-- Ending everything between two people, and everything of one person.
------------------------------------------------------------------------------
/**
 * Ends the active match (closing its chat), any Instant Meet between the two, pending Instant
 * acceptances and pending date rounds. The nudge says `unmatch`, exactly as a normal unmatch
 * does, so the other person cannot tell a block from an unmatch.
 */
create function private.end_pair(p_one uuid, p_other uuid, p_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended uuid;
  conversation uuid;
  session public.instant_sessions%rowtype;
begin
  update public.matches set active = false, ended_at = now(), ended_by = p_by
    where user_a = least(p_one, p_other) and user_b = greatest(p_one, p_other) and active
    returning id into ended;
  if ended is not null then
    update public.conversations set closed_at = now()
      where match_id = ended and closed_at is null
      returning id into conversation;
    if conversation is not null then
      perform realtime.send(jsonb_build_object('conversation_id', conversation), 'closed',
                            'chat:' || conversation::text, true);
    end if;
    perform realtime.send(jsonb_build_object('reason', 'unmatch'), 'refresh', 'user:' || p_one::text, true);
    perform realtime.send(jsonb_build_object('reason', 'unmatch'), 'refresh', 'user:' || p_other::text, true);
  end if;

  select * into session from public.instant_sessions
    where user_a = least(p_one, p_other) and user_b = greatest(p_one, p_other) and ended_at is null
    limit 1;
  if session.id is not null then
    perform private.end_instant_session(session.id, p_by, 'unavailable');
  end if;
  delete from private.instant_accepts
    where (user_id = p_one and candidate_id = p_other) or (user_id = p_other and candidate_id = p_one);
  update public.date_rounds set status = 'void', closed_at = now()
    where status = 'open' and user_a = least(p_one, p_other) and user_b = greatest(p_one, p_other);
end;
$$;
revoke all on function private.end_pair(uuid, uuid, uuid) from public, anon, authenticated;

/** Takes a person out of everything at once (a ban or a deletion). */
create function private.withdraw_account(p_user uuid, p_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  other uuid;
begin
  for other in
    select case when user_a = p_user then user_b else user_a end
    from public.matches where p_user in (user_a, user_b) and active
    union
    select case when user_a = p_user then user_b else user_a end
    from public.instant_sessions where p_user in (user_a, user_b) and ended_at is null
  loop
    perform private.end_pair(p_user, other, p_by);
  end loop;
  delete from private.instant_presence where user_id = p_user;
  delete from private.instant_accepts where user_id = p_user or candidate_id = p_user;
  delete from private.instant_skips where user_id = p_user;
  update public.date_rounds set status = 'void', closed_at = now()
    where status = 'open' and p_user in (user_a, user_b);
end;
$$;
revoke all on function private.withdraw_account(uuid, uuid) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Block and unblock (spec 42).
------------------------------------------------------------------------------
create function public.block_user(p_target uuid)
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
  if p_target is null or p_target = uid or not exists (select 1 from public.profiles where id = p_target) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  perform private.lock_pair(uid, p_target);
  insert into public.blocks (blocker_id, blocked_id) values (uid, p_target) on conflict do nothing;
  perform private.end_pair(uid, p_target, uid);
  return jsonb_build_object('ok', true);
end;
$$;

-- Unblocking lets the two find each other again; it never brings back a match or a chat.
create function public.unblock_user(p_target uuid)
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
  delete from public.blocks where blocker_id = uid and blocked_id = p_target;
  return jsonb_build_object('ok', true, 'removed', found);
end;
$$;

-- The caller's own blocks, with a name only (the blocker knows who they blocked).
create function public.get_my_blocks()
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
  return jsonb_build_object('ok', true, 'blocks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.blocked_id,
      'name', case when p.privacy_mode = 'anonymous' then null else p.display_name end,
      'blocked_at', b.created_at) order by b.created_at desc)
    from public.blocks b join public.profiles p on p.id = b.blocked_id
    where b.blocker_id = uid
  ), '[]'::jsonb));
end;
$$;

------------------------------------------------------------------------------
-- Report (spec 42). Optionally blocks in the same step.
------------------------------------------------------------------------------
create function private.report_evidence(p_reporter uuid, p_reported uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('messages', coalesce(jsonb_agg(item order by sent), '[]'::jsonb))
  from (
    select m.created_at as sent, jsonb_build_object(
      'from', case when m.sender_id = p_reporter then 'reporter' else 'reported' end,
      'body', m.body,
      'at', m.created_at) as item
    from public.messages m
    where m.conversation_id in (
      select a.conversation_id from public.conversation_members a
      join public.conversation_members b on b.conversation_id = a.conversation_id
      where a.user_id = p_reporter and b.user_id = p_reported)
    order by m.created_at desc
    limit 50
  ) recent;
$$;
revoke all on function private.report_evidence(uuid, uuid) from public, anon, authenticated;

create function public.report_user(
  p_target uuid, p_category public.report_category, p_details text, p_context text, p_block boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  fingerprint text;
  recent_reporters integer;
  created uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_target is null or p_target = uid or p_category is null
     or p_context not in ('profile', 'chat', 'instant', 'discovery')
     or char_length(coalesce(p_details, '')) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  fingerprint := private.user_fingerprint(p_target);
  if fingerprint is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if (select count(*) from public.reports where reporter_id = uid and created_at > now() - interval '24 hours')
     >= coalesce((private.config_value('report_daily_limit'))::int, 10) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.reports (reporter_id, reported_id, reported_fingerprint, category, details, context, evidence, priority)
  values (uid, p_target, fingerprint, p_category, nullif(btrim(coalesce(p_details, '')), ''), p_context,
          private.report_evidence(uid, p_target),
          p_category in ('underage', 'threat', 'stalking'))
  returning id into created;

  -- Several different people reporting the same person within a week: look at it first.
  select count(distinct reporter_id) into recent_reporters from public.reports
    where reported_id = p_target and created_at > now() - interval '7 days';
  if recent_reporters >= 3 then
    update public.reports set priority = true where reported_id = p_target and status = 'open';
  end if;

  if coalesce(p_block, false) then
    perform private.lock_pair(uid, p_target);
    insert into public.blocks (blocker_id, blocked_id) values (uid, p_target) on conflict do nothing;
    perform private.end_pair(uid, p_target, uid);
  end if;
  return jsonb_build_object('ok', true, 'blocked', coalesce(p_block, false));
end;
$$;

------------------------------------------------------------------------------
-- Moderation (moderators only; the admin surface arrives in Phase 15).
------------------------------------------------------------------------------
create function private.require_moderator()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or not private.has_admin_role(uid, 'moderator') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return uid;
end;
$$;
revoke all on function private.require_moderator() from public, anon, authenticated;

create function public.moderation_set_state(
  p_user uuid, p_state public.account_state, p_reason text, p_until timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  moderator uuid := private.require_moderator();
  target_print text;
begin
  if p_user is null or p_user = moderator or p_state = 'deletion_pending' then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if private.has_admin_role(p_user, 'moderator') and not private.has_admin_role(moderator, 'admin') then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if p_reason is not null and p_reason not in ('community_rules', 'fake_account', 'underage', 'safety', 'other') then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  target_print := private.user_fingerprint(p_user);
  if target_print is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.account_private
    set account_state = p_state,
        restriction_reason = case when p_state = 'active' then null else coalesce(p_reason, 'community_rules') end,
        restricted_until = case when p_state = 'suspended' then p_until end
    where id = p_user;

  if p_state = 'banned' then
    perform private.withdraw_account(p_user, moderator);
    insert into private.banned_emails (fingerprint, reason) values (target_print, p_reason)
    on conflict (fingerprint) do update set banned_at = now(), reason = excluded.reason;
  elsif p_state = 'suspended' then
    -- Hidden everywhere while suspended (not eligible); matches come back if restored.
    delete from private.instant_presence where user_id = p_user;
    perform private.end_instant_session(s.id, moderator, 'unavailable')
      from public.instant_sessions s where p_user in (s.user_a, s.user_b) and s.ended_at is null;
  else
    delete from private.banned_emails b where b.fingerprint = target_print;
  end if;

  insert into public.moderation_actions (moderator_id, target_user, target_fingerprint, action, reason)
  values (moderator, p_user, target_print,
          case p_state when 'banned' then 'ban' when 'suspended' then 'suspend' else 'restore' end, p_reason);
  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (moderator, 'account_' || p_state::text, 'user', p_user::text,
          jsonb_build_object('reason', p_reason, 'until', p_until));
  perform realtime.send(jsonb_build_object('reason', 'account'), 'refresh', 'user:' || p_user::text, true);
  return jsonb_build_object('ok', true);
end;
$$;

create function public.moderation_review_photo(p_photo uuid, p_approve boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  moderator uuid := private.require_moderator();
  owner uuid;
begin
  update public.profile_photos set status = case when p_approve then 'approved' else 'rejected' end::public.photo_status
    where id = p_photo
    returning user_id into owner;
  if owner is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  insert into public.moderation_actions (moderator_id, target_user, action, reason, photo_id)
  values (moderator, owner, case when p_approve then 'approve_photo' else 'reject_photo' end, p_reason, p_photo);
  perform realtime.send(jsonb_build_object('reason', 'profile'), 'refresh', 'user:' || owner::text, true);
  return jsonb_build_object('ok', true);
end;
$$;

create function public.moderation_resolve_report(p_report uuid, p_actioned boolean, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  moderator uuid := private.require_moderator();
  target uuid;
begin
  update public.reports
    set status = case when p_actioned then 'actioned' else 'dismissed' end,
        resolved_at = now(), resolved_by = moderator, resolution = left(p_note, 1000)
    where id = p_report and status = 'open'
    returning reported_id into target;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  insert into public.moderation_actions (moderator_id, target_user, action, reason, report_id)
  values (moderator, target, case when p_actioned then 'resolve_report' else 'dismiss_report' end, p_note, p_report);
  return jsonb_build_object('ok', true);
end;
$$;

-- What a moderator works through: open reports (most urgent first) and photos awaiting review.
create function public.moderation_queue()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  moderator uuid := private.require_moderator();
begin
  return jsonb_build_object(
    'ok', true,
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'category', r.category, 'context', r.context, 'details', r.details,
        'priority', r.priority, 'created_at', r.created_at, 'reported_id', r.reported_id,
        'reported_deleted', r.reported_id is null, 'evidence', r.evidence,
        'reports_against', (select count(*) from public.reports x
                            where x.reported_fingerprint = r.reported_fingerprint))
        order by r.priority desc, r.created_at)
      from (select * from public.reports where status = 'open'
            order by priority desc, created_at limit 50) r), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'user_id', ph.user_id, 'path', ph.storage_path,
                                          'position', ph.position, 'created_at', ph.created_at)
                       order by ph.created_at)
      from (select * from public.profile_photos where status = 'pending' order by created_at limit 50) ph), '[]'::jsonb)
  );
end;
$$;

------------------------------------------------------------------------------
-- Account deletion (service role, called by the account-delete Edge Function).
------------------------------------------------------------------------------
create function public.account_prepare_deletion(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.account_private where id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  update public.account_private set account_state = 'deletion_pending'
    where id = p_user and account_state <> 'banned';
  perform private.withdraw_account(p_user, p_user);
  insert into public.audit_events (actor_id, action, target_type, target_id)
  values (null, 'account_deleted', 'user_fingerprint', private.user_fingerprint(p_user));
  return jsonb_build_object('ok', true);
end;
$$;

------------------------------------------------------------------------------
-- Sign-up refuses a banned address (the hook already allows only SRMIST domains).
------------------------------------------------------------------------------
create or replace function public.hook_before_user_created(event jsonb)
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
  if exists (select 1 from private.banned_emails where fingerprint = private.email_fingerprint(email)) then
    return jsonb_build_object(
      'error', jsonb_build_object('http_code', 403, 'message', 'This email can''t be used for SOUL.')
    );
  end if;

  return '{}'::jsonb;
end;
$$;

------------------------------------------------------------------------------
-- get_my_status: adds what the restricted screen may show.
------------------------------------------------------------------------------
create or replace function public.get_my_status()
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
      a.restricted_until,
      a.restriction_reason,
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
    'current_terms_version', private.current_terms_version(),
    'restricted_until', s.restricted_until,
    'restriction_reason', s.restriction_reason
  )
  from s;
$$;

------------------------------------------------------------------------------
-- Retention (C-29) and timed suspensions, hourly.
------------------------------------------------------------------------------
create function private.retention_sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.account_private
    set account_state = 'active', restricted_until = null, restriction_reason = null
    where account_state = 'suspended' and restricted_until is not null and restricted_until <= now();
  delete from public.instant_sessions
    where started_at < now() - make_interval(days => coalesce((private.config_value('retention_instant_days'))::int, 90));
  delete from public.reports
    where status <> 'open'
      and resolved_at < now() - make_interval(days => coalesce((private.config_value('retention_safety_days'))::int, 365));
  delete from private.banned_emails
    where banned_at < now() - make_interval(days => coalesce((private.config_value('retention_safety_days'))::int, 365));
  delete from public.payment_orders
    where status in ('created', 'expired', 'cancelled')
      and created_at < now() - make_interval(days => coalesce((private.config_value('retention_unpaid_order_days'))::int, 30));
end;
$$;
revoke all on function private.retention_sweep() from public, anon, authenticated;

select cron.schedule('soul-retention', '41 * * * *', 'select private.retention_sweep()');

revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.get_my_blocks() from public, anon;
revoke all on function public.report_user(uuid, public.report_category, text, text, boolean) from public, anon;
revoke all on function public.moderation_set_state(uuid, public.account_state, text, timestamptz) from public, anon;
revoke all on function public.moderation_review_photo(uuid, boolean, text) from public, anon;
revoke all on function public.moderation_resolve_report(uuid, boolean, text) from public, anon;
revoke all on function public.moderation_queue() from public, anon;
revoke all on function public.account_prepare_deletion(uuid) from public, anon, authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.get_my_blocks() to authenticated;
grant execute on function public.report_user(uuid, public.report_category, text, text, boolean) to authenticated;
grant execute on function public.moderation_set_state(uuid, public.account_state, text, timestamptz) to authenticated;
grant execute on function public.moderation_review_photo(uuid, boolean, text) to authenticated;
grant execute on function public.moderation_resolve_report(uuid, boolean, text) to authenticated;
grant execute on function public.moderation_queue() to authenticated;
grant execute on function public.account_prepare_deletion(uuid) to service_role;
