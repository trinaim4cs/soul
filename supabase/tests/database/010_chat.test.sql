-- Phase 9: chat (DECISIONS D-012, D-049). Neutral identities only; counts cover only this
-- file's fixtures, so local test data cannot change the result.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(47);

create function pg_temp.mk(p_id uuid, p_gender public.gender, p_show public.gender[])
returns void language plpgsql as $$
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at)
  values (p_id, 'test.user.' || right(p_id::text, 12) || '@srmist.edu.in', 'authenticated', 'authenticated', now());
  update public.account_private
    set terms_version = (select value ->> 'version' from public.app_config where key = 'current_terms_version'),
        terms_accepted_at = now(),
        date_of_birth = (current_date - interval '22 years 10 days')::date,
        profile_completed_at = now() - interval '30 days'
    where id = p_id;
  update public.profiles set display_name = 'Test User', hook = 'Hook', gender = p_gender where id = p_id;
  update public.preferences set show_me = p_show where user_id = p_id;
  insert into public.profile_photos (id, user_id, storage_path, blurred_path, position, status, source, width, height)
  values (p_id, p_id, p_id || '/' || p_id || '.jpg', p_id || '/' || p_id || '.jpg', 0, 'approved', 'camera', 1080, 1350);
  insert into public.swipe_credit_ledger (user_id, entry, bucket, delta, valid_from, idempotency_key)
  values (p_id, 'grant', 'topup', 20, now(), 'fixture:' || p_id);
end $$;

select pg_temp.mk('00000090-0000-4000-8000-000000000001', 'woman', '{man}');  -- V
select pg_temp.mk('00000090-0000-4000-8000-0000000000a1', 'man', '{woman}');  -- M1 (matched with V)
select pg_temp.mk('00000090-0000-4000-8000-0000000000a2', 'man', '{woman}');  -- M2 (matched with V, other chat)
select pg_temp.mk('00000090-0000-4000-8000-0000000000a3', 'man', '{woman}');  -- M3 (outsider)

-- Two matches, made the real way.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000090-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select public.swipe_right('00000090-0000-4000-8000-000000000001', '40000090-0000-4000-8000-000000000001');
set local request.jwt.claims = '{"sub": "00000090-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select public.swipe_right('00000090-0000-4000-8000-000000000001', '40000090-0000-4000-8000-000000000002');
set local request.jwt.claims = '{"sub": "00000090-0000-4000-8000-000000000001", "role": "authenticated"}';
select public.swipe_right('00000090-0000-4000-8000-0000000000a1', '40000090-0000-4000-8000-000000000003');
select public.swipe_right('00000090-0000-4000-8000-0000000000a2', '40000090-0000-4000-8000-000000000004');
reset role;

create temp table chat on commit drop as
  select c.id, m.id as match_id from public.conversations c join public.matches m on m.id = c.match_id
  where m.user_a = '00000090-0000-4000-8000-000000000001' and m.user_b = '00000090-0000-4000-8000-0000000000a1';
create temp table other_chat on commit drop as
  select c.id from public.conversations c join public.matches m on m.id = c.match_id
  where m.user_a = '00000090-0000-4000-8000-000000000001' and m.user_b = '00000090-0000-4000-8000-0000000000a2';
grant select on chat, other_chat to authenticated;

select is((select count(*)::int from chat), 1, 'a match comes with one conversation');
select is((select count(*)::int from public.conversation_members where conversation_id = (select id from chat)),
  2, 'and both people are its members');

-- ---------------------------------------------------------------- as V: sending
set local role authenticated;
select is(public.get_my_matches() -> 'matches' -> 0 ->> 'conversation_id' is not null, true,
  'the match list carries the conversation');
select is(public.get_my_matches() -> 'matches' -> 0 -> 'last_message', 'null'::jsonb, 'a new conversation has no last message');

select is(public.send_message((select id from chat), E'  hello there \n', '50000090-0000-4000-8000-000000000001')
          -> 'message' ->> 'body', 'hello there', 'a message is stored, trimmed');
select is(public.send_message((select id from chat), 'hello there', '50000090-0000-4000-8000-000000000001')
          ->> 'replayed', 'true', 'the same message sent again is stored once');
select is(public.send_message((select id from chat), E' \n\t ', '50000090-0000-4000-8000-000000000002')
          ->> 'reason', 'invalid_body', 'an empty message is refused');
select is(public.send_message((select id from chat), repeat('x', 2001), '50000090-0000-4000-8000-000000000003')
          ->> 'reason', 'invalid_body', 'a message over 2000 characters is refused');
select is(public.send_message((select id from chat), repeat('x', 2000), '50000090-0000-4000-8000-000000000004')
          ->> 'ok', 'true', 'a 2000-character message is accepted');

reset role;
create temp table first_message on commit drop as
  select id from public.messages where client_id = '50000090-0000-4000-8000-000000000001';
create temp table foreign_message on commit drop as
  with sent as (
    insert into public.messages (conversation_id, sender_id, body, client_id)
    values ((select id from other_chat), '00000090-0000-4000-8000-0000000000a2', 'elsewhere', gen_random_uuid())
    returning id)
  select id from sent;
grant select on first_message, foreign_message to authenticated;
set local role authenticated;

select is(public.send_message((select id from chat), 'a reply', '50000090-0000-4000-8000-000000000005',
                              (select id from first_message)) -> 'message' -> 'reply_to' ->> 'body',
  'hello there', 'a reply carries a preview of the message it answers');
select is(public.send_message((select id from chat), 'bad reply', '50000090-0000-4000-8000-000000000006',
                              (select id from foreign_message)) ->> 'reason',
  'invalid_reply', 'a reply cannot point into another conversation');

select throws_ok($$select count(*) from public.messages$$, '42501', null, 'the app cannot read messages directly');
select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body, client_id)
    values ((select id from chat), '00000090-0000-4000-8000-000000000001', 'direct', gen_random_uuid())$$,
  '42501', null, 'the app cannot write messages directly');
select throws_ok($$select count(*) from public.conversations$$, '42501', null,
  'the app cannot read conversations directly');

-- ---------------------------------------------------------------- outsiders
set local request.jwt.claims = '{"sub": "00000090-0000-4000-8000-0000000000a3", "role": "authenticated"}';
select is(public.send_message((select id from chat), 'let me in', '50000090-0000-4000-8000-000000000007')
          ->> 'reason', 'not_available', 'someone outside the conversation cannot send');
select is(public.get_messages((select id from chat)) ->> 'reason', 'not_available',
  'someone outside the conversation cannot read');
select is(public.mark_conversation_read((select id from chat), 999) ->> 'reason', 'not_available',
  'someone outside the conversation cannot mark it read');
select ok(not private.can_join_topic('chat:' || (select id from chat)), 'an outsider cannot join the chat topic');
select ok(not private.can_join_topic('typing:' || (select id from chat)), 'nor the typing topic');
select ok(not private.can_join_topic('user:00000090-0000-4000-8000-000000000001'),
  'nobody can join another account''s topic');
select ok(private.can_join_topic('user:00000090-0000-4000-8000-0000000000a3'), 'an account can join its own topic');
select ok(not private.can_join_topic('chat:not-a-conversation') and not private.can_join_topic('anything'),
  'malformed topics are refused');
-- Another member of a different chat with V cannot read this one.
set local request.jwt.claims = '{"sub": "00000090-0000-4000-8000-0000000000a2", "role": "authenticated"}';
select is(public.get_messages((select id from chat)) ->> 'reason', 'not_available',
  'a different match of the same person cannot read this conversation');

-- ---------------------------------------------------------------- as M1: reading
set local request.jwt.claims = '{"sub": "00000090-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select ok(private.can_join_topic('chat:' || (select id from chat))
          and private.can_join_topic('typing:' || (select id from chat)),
  'a member can join the chat and typing topics');
select is(public.get_my_matches() -> 'matches' -> 0 -> 'unread', '3'::jsonb, 'unread counts the other person''s messages');
select is(public.get_my_matches() -> 'matches' -> 0 -> 'last_message' ->> 'body', 'a reply',
  'the list shows the last message');
select is(public.get_my_matches() -> 'matches' -> 0 -> 'last_message' -> 'mine', 'false'::jsonb,
  'and whose it was');
select is(jsonb_array_length(public.get_messages((select id from chat)) -> 'messages'), 3, 'the page holds the messages');
select is(public.get_messages((select id from chat)) -> 'messages' -> 0 ->> 'body', 'a reply', 'newest first');
select is(public.get_messages((select id from chat)) -> 'has_more', 'false'::jsonb, 'no older page');
select is(public.get_messages((select id from chat)) -> 'my_read', '0'::jsonb, 'nothing read yet');

select is(public.mark_conversation_read((select id from chat), 999999999) ->> 'read',
  (public.get_messages((select id from chat)) -> 'messages' -> 0 ->> 'id'),
  'a read position cannot pass the newest real message');
select is(public.get_my_matches() -> 'matches' -> 0 -> 'unread', '0'::jsonb, 'reading clears the unread count');
select is(public.mark_conversation_read((select id from chat), 1) ->> 'ok', 'true', 'marking an older message is accepted');
select is(public.get_my_matches() -> 'matches' -> 0 -> 'unread', '0'::jsonb, 'but never moves the position back');

-- ---------------------------------------------------------------- read receipts are mutual
set local request.jwt.claims = '{"sub": "00000090-0000-4000-8000-000000000001", "role": "authenticated"}';
select is(public.get_messages((select id from chat)) ->> 'their_read',
  (public.get_messages((select id from chat)) -> 'messages' -> 0 ->> 'id'),
  'with receipts on for both, the sender sees how far the other has read');
reset role;
update public.profiles set read_receipts = false where id = '00000090-0000-4000-8000-0000000000a1';
set local role authenticated;
select is(public.get_messages((select id from chat)) -> 'their_read', 'null'::jsonb,
  'someone who turned receipts off is not reported');
set local request.jwt.claims = '{"sub": "00000090-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select is(public.get_messages((select id from chat)) -> 'their_read', 'null'::jsonb,
  'and does not see the other person''s receipts either');
select is(public.get_my_profile() -> 'read_receipts', 'false'::jsonb, 'the setting is in the owner''s profile');

-- ---------------------------------------------------------------- rate limit, paging, broadcasts
select is((select count(*) filter (where r ->> 'ok' = 'true')::int
           from (select public.send_message((select id from chat), 'burst ' || n, gen_random_uuid()) as r
                 from generate_series(1, 20) as n) s),
  15, 'at most 15 messages go through in 10 seconds');
reset role;
insert into public.messages (conversation_id, sender_id, body, client_id, created_at)
select (select id from chat), '00000090-0000-4000-8000-0000000000a1', 'old ' || n, gen_random_uuid(), now() - interval '1 day'
from generate_series(1, 30) as n;
set local role authenticated;
select is(public.get_messages((select id from chat), null, 40) -> 'has_more', 'true'::jsonb, 'long conversations page');
select is(jsonb_array_length(public.get_messages((select id from chat),
    (public.get_messages((select id from chat), null, 40) -> 'messages' -> 39 ->> 'id')::bigint, 40) -> 'messages'),
  8, 'the next page continues before the last message of the first');
reset role;
select is((select count(*)::int from realtime.messages
           where topic = 'chat:' || (select id from chat) and event = 'message'),
  (select count(*)::int from public.messages where conversation_id = (select id from chat)),
  'every stored message is broadcast on the conversation topic');
select is((select count(*)::int from realtime.messages
           where topic = 'chat:' || (select id from chat) and event = 'read'),
  1, 'a read receipt is broadcast only while receipts are shared');

-- ---------------------------------------------------------------- unmatch closes the conversation
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000090-0000-4000-8000-000000000001", "role": "authenticated"}';
select public.unmatch((select match_id from chat));
select is(public.send_message((select id from chat), 'after', gen_random_uuid()) ->> 'reason', 'not_available',
  'nobody can send after an unmatch');
select ok(not private.can_join_topic('chat:' || (select id from chat)), 'nor join its topic');
reset role;
select ok((select closed_at is not null from public.conversations where id = (select id from chat))
          and (select count(*) from public.messages where conversation_id = (select id from chat)) > 0,
  'the conversation is closed and its messages are kept as evidence');

select * from finish();
rollback;
