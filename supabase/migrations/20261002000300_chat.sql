-- SOUL Phase 9: chat (spec v2 section 25, DECISIONS D-012, D-049).
--
-- A conversation belongs to a match. Messages are written only by send_message(); a trigger
-- then broadcasts them on a private Realtime topic that clients can listen to but never
-- publish on, so a message on the wire is always one the server stored. Nothing here is
-- readable or writable through the Data API tables: every access is a function that
-- re-checks the match.

------------------------------------------------------------------------------
-- Read receipts (C-19): on by default. They are shown only when both people have them on.
------------------------------------------------------------------------------
alter table public.profiles add column read_receipts boolean not null default true;
grant update (read_receipts) on public.profiles to authenticated;

------------------------------------------------------------------------------
-- Tables.
------------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  -- Set when the match ends. Messages stay as moderation evidence; nobody can read them.
  closed_at timestamptz
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The newest message this person has seen (0 = none).
  last_read_message_id bigint not null default 0,
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  reply_to_id bigint references public.messages (id) on delete set null,
  -- Chosen by the sending device: a retry of the same message is stored once.
  client_id uuid not null,
  created_at timestamptz not null default now(),
  constraint message_body_length check (char_length(body) between 1 and 2000),
  constraint message_client_unique unique (sender_id, client_id)
);
create index messages_conversation_idx on public.messages (conversation_id, id desc);
create index messages_sender_recent_idx on public.messages (sender_id, created_at desc);

alter table public.conversations enable row level security;
alter table public.conversations force row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_members force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;
revoke all on public.conversations, public.conversation_members, public.messages from anon, authenticated;

------------------------------------------------------------------------------
-- Access helpers.
------------------------------------------------------------------------------
/** A member of an open conversation whose match is still visible to them (D-048). */
create function private.can_use_conversation(p_user uuid, p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    join public.matches m on m.id = c.match_id
    where c.id = p_conversation
      and c.closed_at is null
      and m.active
      and p_user in (m.user_a, m.user_b)
      and private.can_view_match(p_user, case when m.user_a = p_user then m.user_b else m.user_a end)
  );
$$;
revoke all on function private.can_use_conversation(uuid, uuid) from public, anon, authenticated;

create function private.other_member(p_user uuid, p_conversation uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.conversation_members
  where conversation_id = p_conversation and user_id <> p_user
  limit 1;
$$;
revoke all on function private.other_member(uuid, uuid) from public, anon, authenticated;

/** Read receipts are mutual: shown only when both people keep them on. */
create function private.receipts_shared(p_one uuid, p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(read_receipts), false) and count(*) = 2
  from public.profiles where id in (p_one, p_other);
$$;
revoke all on function private.receipts_shared(uuid, uuid) from public, anon, authenticated;

create function private.message_json(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id,
    'conversation_id', m.conversation_id,
    'sender_id', m.sender_id,
    'body', m.body,
    'client_id', m.client_id,
    'created_at', m.created_at,
    'reply_to', case when r.id is null then null else jsonb_build_object(
      'id', r.id, 'sender_id', r.sender_id, 'body', left(r.body, 140)) end
  )
  from public.messages m
  left join public.messages r on r.id = m.reply_to_id
  where m.id = p_id;
$$;
revoke all on function private.message_json(bigint) from public, anon, authenticated;

------------------------------------------------------------------------------
-- Realtime authorization (D-012). Private topics only:
--   chat:<conversation>    server to clients: `message`, `read`, `closed`
--   typing:<conversation>  client to client: typing only
--   user:<account>         server to that account: `refresh` (a new match or message)
-- Clients can receive on topics they belong to and can publish only on `typing:`.
------------------------------------------------------------------------------
create function private.can_join_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  kind text := split_part(p_topic, ':', 1);
  id text := split_part(p_topic, ':', 2);
begin
  if uid is null or id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  if kind = 'user' then
    return id::uuid = uid;
  end if;
  if kind in ('chat', 'typing') then
    return private.can_use_conversation(uid, id::uuid);
  end if;
  return false;
end;
$$;
revoke all on function private.can_join_topic(text) from public, anon;
grant execute on function private.can_join_topic(text) to authenticated;

create policy soul_receive_broadcast on realtime.messages
  for select to authenticated
  using (extension = 'broadcast' and private.can_join_topic((select realtime.topic())));

create policy soul_send_typing on realtime.messages
  for insert to authenticated
  with check (
    extension = 'broadcast'
    and (select realtime.topic()) like 'typing:%'
    and private.can_join_topic((select realtime.topic()))
  );

------------------------------------------------------------------------------
-- A conversation is created with its match, and both people are told.
------------------------------------------------------------------------------
create function private.handle_new_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation uuid;
begin
  insert into public.conversations (match_id) values (new.id) returning id into conversation;
  insert into public.conversation_members (conversation_id, user_id)
  values (conversation, new.user_a), (conversation, new.user_b);
  perform realtime.send(jsonb_build_object('reason', 'match'), 'refresh', 'user:' || new.user_a::text, true);
  perform realtime.send(jsonb_build_object('reason', 'match'), 'refresh', 'user:' || new.user_b::text, true);
  return new;
end;
$$;
revoke all on function private.handle_new_match() from public, anon, authenticated;
create trigger on_match_created
  after insert on public.matches
  for each row execute function private.handle_new_match();

-- Matches made before this migration.
with created as (
  insert into public.conversations (match_id)
  select m.id from public.matches m
  where not exists (select 1 from public.conversations c where c.match_id = m.id)
  returning id, match_id
)
insert into public.conversation_members (conversation_id, user_id)
select c.id, u.user_id
from created c
join public.matches m on m.id = c.match_id
cross join lateral (values (m.user_a), (m.user_b)) as u (user_id);
update public.conversations c set closed_at = m.ended_at
from public.matches m where m.id = c.match_id and not m.active and c.closed_at is null;

------------------------------------------------------------------------------
-- A stored message is broadcast to the conversation, and the other person's account topic
-- is nudged so their chat list and unread count update.
------------------------------------------------------------------------------
create function private.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(private.message_json(new.id), 'message', 'chat:' || new.conversation_id::text, true);
  perform realtime.send(
    jsonb_build_object('reason', 'message', 'conversation_id', new.conversation_id),
    'refresh',
    'user:' || private.other_member(new.sender_id, new.conversation_id)::text,
    true);
  return new;
end;
$$;
revoke all on function private.handle_new_message() from public, anon, authenticated;
create trigger on_message_created
  after insert on public.messages
  for each row execute function private.handle_new_message();

------------------------------------------------------------------------------
-- send_message: the only way a message is written.
------------------------------------------------------------------------------
create function public.send_message(
  p_conversation uuid, p_body text, p_client_id uuid, p_reply_to bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  clean text := btrim(coalesce(p_body, ''), E' \t\n\r');
  message_id bigint;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_conversation is null or p_client_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if char_length(clean) = 0 or char_length(clean) > 2000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_body');
  end if;
  if not private.can_use_conversation(uid, p_conversation) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;

  -- A retry of a message this device already sent returns the stored one.
  select id into message_id from public.messages where sender_id = uid and client_id = p_client_id;
  if message_id is not null then
    return jsonb_build_object('ok', true, 'replayed', true, 'message', private.message_json(message_id));
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.messages where id = p_reply_to and conversation_id = p_conversation
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_reply');
  end if;

  -- A person, not a script: at most 15 messages in any 10 seconds.
  if (select count(*) from public.messages
      where sender_id = uid and created_at > now() - interval '10 seconds') >= 15 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.messages (conversation_id, sender_id, body, reply_to_id, client_id)
  values (p_conversation, uid, clean, p_reply_to, p_client_id)
  on conflict (sender_id, client_id) do nothing
  returning id into message_id;
  if message_id is null then
    -- The same message arrived twice at once; the other request stored it.
    select id into message_id from public.messages where sender_id = uid and client_id = p_client_id;
    return jsonb_build_object('ok', true, 'replayed', true, 'message', private.message_json(message_id));
  end if;

  update public.conversations set last_message_at = now() where id = p_conversation;
  update public.conversation_members
    set last_read_message_id = greatest(last_read_message_id, message_id)
    where conversation_id = p_conversation and user_id = uid;

  return jsonb_build_object('ok', true, 'replayed', false, 'message', private.message_json(message_id));
end;
$$;

------------------------------------------------------------------------------
-- get_messages: one page, newest first, with both read positions.
------------------------------------------------------------------------------
create function public.get_messages(
  p_conversation uuid, p_before bigint default null, p_limit integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  page_size integer := least(greatest(coalesce(p_limit, 40), 1), 100);
  other uuid;
  page jsonb;
  oldest bigint;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not private.can_use_conversation(uid, p_conversation) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  other := private.other_member(uid, p_conversation);

  select coalesce(jsonb_agg(private.message_json(m.id) order by m.id desc), '[]'::jsonb), min(m.id)
  into page, oldest
  from (
    select id from public.messages
    where conversation_id = p_conversation and (p_before is null or id < p_before)
    order by id desc
    limit page_size
  ) m;

  return jsonb_build_object(
    'ok', true,
    'messages', page,
    'has_more', oldest is not null and exists (
      select 1 from public.messages where conversation_id = p_conversation and id < oldest),
    'my_read', (select last_read_message_id from public.conversation_members
                where conversation_id = p_conversation and user_id = uid),
    -- null when read receipts are not shared.
    'their_read', case when private.receipts_shared(uid, other) then (
      select last_read_message_id from public.conversation_members
      where conversation_id = p_conversation and user_id = other) end
  );
end;
$$;

------------------------------------------------------------------------------
-- mark_conversation_read: moves the caller's read position forward, never back.
------------------------------------------------------------------------------
create function public.mark_conversation_read(p_conversation uuid, p_message bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  newest bigint;
  target bigint;
  moved boolean;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not private.can_use_conversation(uid, p_conversation) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  select coalesce(max(id), 0) into newest from public.messages where conversation_id = p_conversation;
  -- A device cannot claim to have read a message that does not exist in this conversation.
  target := least(greatest(coalesce(p_message, 0), 0), newest);

  update public.conversation_members
    set last_read_message_id = target
    where conversation_id = p_conversation and user_id = uid and last_read_message_id < target;
  moved := found;

  if moved and private.receipts_shared(uid, private.other_member(uid, p_conversation)) then
    perform realtime.send(
      jsonb_build_object('user_id', uid, 'message_id', target),
      'read', 'chat:' || p_conversation::text, true);
  end if;
  return jsonb_build_object('ok', true, 'read', target);
end;
$$;

revoke all on function public.send_message(uuid, text, uuid, bigint) from public, anon;
revoke all on function public.get_messages(uuid, bigint, integer) from public, anon;
revoke all on function public.mark_conversation_read(uuid, bigint) from public, anon;
grant execute on function public.send_message(uuid, text, uuid, bigint) to authenticated;
grant execute on function public.get_messages(uuid, bigint, integer) to authenticated;
grant execute on function public.mark_conversation_read(uuid, bigint) to authenticated;

------------------------------------------------------------------------------
-- Match functions, extended with the conversation.
------------------------------------------------------------------------------
/** One match as the caller sees it: the person, the conversation, its last message, unread. */
create function private.match_json(p_viewer uuid, p_match uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id,
    'created_at', m.created_at,
    'seen', (case when m.user_a = p_viewer then m.a_seen_at else m.b_seen_at end) is not null,
    'person', private.profile_card(o.other, true),
    'conversation_id', c.id,
    'last_message', (
      select jsonb_build_object(
        'id', lm.id, 'body', left(lm.body, 140), 'mine', lm.sender_id = p_viewer,
        'created_at', lm.created_at)
      from public.messages lm where lm.conversation_id = c.id order by lm.id desc limit 1),
    'unread', (
      select count(*) from public.messages um
      join public.conversation_members cm
        on cm.conversation_id = um.conversation_id and cm.user_id = p_viewer
      where um.conversation_id = c.id and um.sender_id <> p_viewer
        and um.id > cm.last_read_message_id),
    'last_activity', coalesce(c.last_message_at, m.created_at)
  )
  from public.matches m
  cross join lateral (select case when m.user_a = p_viewer then m.user_b else m.user_a end as other) o
  left join public.conversations c on c.match_id = m.id
  where m.id = p_match;
$$;
revoke all on function private.match_json(uuid, uuid) from public, anon, authenticated;

create or replace function public.get_my_matches()
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
  -- Most recent activity first: a new message or a new match.
  return jsonb_build_object('ok', true, 'matches', coalesce((
    select jsonb_agg(j.item order by (j.item ->> 'last_activity')::timestamptz desc)
    from (
      select private.match_json(uid, m.id) as item
      from public.matches m
      cross join lateral (select case when m.user_a = uid then m.user_b else m.user_a end as other) o
      where m.active and uid in (m.user_a, m.user_b) and private.can_view_match(uid, o.other)
    ) j
  ), '[]'::jsonb));
end;
$$;

create or replace function public.get_match(p_match uuid)
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
  if not exists (
    select 1 from public.matches m
    cross join lateral (select case when m.user_a = uid then m.user_b else m.user_a end as other) o
    where m.id = p_match and m.active and uid in (m.user_a, m.user_b)
      and private.can_view_match(uid, o.other)
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_available');
  end if;
  return jsonb_build_object('ok', true, 'match', private.match_json(uid, p_match));
end;
$$;

-- Unmatching also closes the conversation and tells both devices.
create or replace function public.unmatch(p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  pair public.matches%rowtype;
  conversation uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into pair from public.matches where id = p_match and uid in (user_a, user_b);
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  update public.matches
    set active = false, ended_at = now(), ended_by = uid
    where id = p_match and active;
  if found then
    update public.conversations set closed_at = now()
      where match_id = p_match and closed_at is null
      returning id into conversation;
    if conversation is not null then
      perform realtime.send(jsonb_build_object('conversation_id', conversation), 'closed',
                            'chat:' || conversation::text, true);
    end if;
    perform realtime.send(jsonb_build_object('reason', 'unmatch'), 'refresh', 'user:' || pair.user_a::text, true);
    perform realtime.send(jsonb_build_object('reason', 'unmatch'), 'refresh', 'user:' || pair.user_b::text, true);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

------------------------------------------------------------------------------
-- get_my_profile: adds the read receipt setting.
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
    'read_receipts', p.read_receipts,
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
