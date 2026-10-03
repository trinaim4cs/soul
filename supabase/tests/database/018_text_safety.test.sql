-- Phase 18: text other people read carries no bidi overrides or control characters
-- (DECISIONS D-057). Neutral identities only.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(17);

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

select pg_temp.mk('00000180-0000-4000-8000-000000000001', 'woman', '{man}');  -- A
select pg_temp.mk('00000180-0000-4000-8000-0000000000a1', 'man', '{woman}');  -- B

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000180-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select public.swipe_right('00000180-0000-4000-8000-000000000001', '40000180-0000-4000-8000-000000000001');
set local request.jwt.claims = '{"sub": "00000180-0000-4000-8000-000000000001", "role": "authenticated"}';
select public.swipe_right('00000180-0000-4000-8000-0000000000a1', '40000180-0000-4000-8000-000000000002');
reset role;

create temp table chat on commit drop as
  select c.id from public.conversations c join public.matches m on m.id = c.match_id
  where m.user_a = '00000180-0000-4000-8000-000000000001' and m.user_b = '00000180-0000-4000-8000-0000000000a1';
grant select on chat to authenticated;

-- ---------------------------------------------------------------- as A, through the API
set local role authenticated;

select throws_ok(
  $$update public.profiles set display_name = 'Test User' || chr(8238) || '10' where id = auth.uid()$$,
  '23514', null, 'a right-to-left override in a name is refused');
select throws_ok(
  $$update public.profiles set display_name = 'Test' || chr(8294) || 'User' where id = auth.uid()$$,
  '23514', null, 'a bidi isolate in a name is refused');
select throws_ok(
  $$update public.profiles set hook = E'Two\nlines' where id = auth.uid()$$,
  '23514', null, 'a line break in the one-line hook is refused');
select throws_ok(
  $$update public.profiles set hook = E'Bell\u0007' where id = auth.uid()$$,
  '23514', null, 'a control character in the hook is refused');
select throws_ok(
  $$update public.profiles set about = E'About\u0085me' where id = auth.uid()$$,
  '23514', null, 'a C1 control character in About me is refused');
select throws_ok(
  $$update public.profiles set about = 'About' || chr(8237) || 'me' where id = auth.uid()$$,
  '23514', null, 'a left-to-right override in About me is refused');

select lives_ok(
  $$update public.profiles set display_name = 'Profile 01 नमस्ते தமிழ் ' || chr(8207) || '👩' || chr(8205) || '💻' where id = auth.uid()$$,
  'every script, directional marks and emoji joiners are allowed in a name');
select lives_ok(
  $$update public.profiles set about = E'Line one\n\tLine two\r\nLine three' where id = auth.uid()$$,
  'About me keeps line breaks and tabs');

select throws_ok(
  $$select public.send_message((select id from chat), 'see you' || chr(8238) || ' at 5', '50000180-0000-4000-8000-000000000001')$$,
  '23514', null, 'a message carrying an override is refused');
select throws_ok(
  $$select public.send_message((select id from chat), E'\u001b[31mred', '50000180-0000-4000-8000-000000000002')$$,
  '23514', null, 'a terminal escape sequence in a message is refused');
select is(
  public.send_message((select id from chat), E'see you\nat 5', '50000180-0000-4000-8000-000000000003') -> 'message' ->> 'body',
  E'see you\nat 5', 'a message keeps its line breaks');

select throws_ok(
  $$select public.report_user('00000180-0000-4000-8000-0000000000a1', 'spam', 'details' || chr(8295) || 'here', 'chat', false)$$,
  '23514', null, 'report details carrying an isolate are refused');
select is(
  public.report_user('00000180-0000-4000-8000-0000000000a1', 'spam', E'details\nhere', 'chat', false) ->> 'ok',
  'true', 'plain multi-line report details are accepted');
reset role;

-- ---------------------------------------------------------------- the rules themselves
select throws_ok(
  $$insert into public.appeals (user_id, account_state, message)
    values ('00000180-0000-4000-8000-000000000001', 'suspended', 'please' || chr(8238) || 'review')$$,
  '23514', null, 'an appeal carrying an override is refused');

select is(
  (select count(*)::int from pg_constraint
    where conname in ('display_name_plain', 'hook_plain', 'about_plain', 'message_body_plain',
                      'report_details_plain', 'appeal_message_plain')
      and contype = 'c' and convalidated),
  6, 'every rule is a validated check constraint');
select is(
  (select display_name from public.profiles where id = '00000180-0000-4000-8000-000000000001'),
  'Profile 01 नमस्ते தமிழ் ' || chr(8207) || '👩' || chr(8205) || '💻', 'the allowed name was stored unchanged');
select is(
  (select count(*)::int from public.messages m join chat on chat.id = m.conversation_id),
  1, 'only the plain message was stored');

select * from finish();
rollback;
