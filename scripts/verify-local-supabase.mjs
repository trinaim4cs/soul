// End-to-end check of the local Supabase stack over HTTP (Phase 3).
// Uses the local development stack only: keys come from `supabase status`, never from files.
// Identities are neutral test users and are deleted afterwards.
import { execSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
const url = status.API_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  throw new Error(`Refusing to run against a non-local Supabase: ${url}`);
}
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const anonClient = () => createClient(url, status.ANON_KEY, { auth: { persistSession: false } });

// Sessions come only from emailed codes (D-046), so test users sign in with a one-time
// token from a generated sign-in link instead of a password.
async function signIn(email) {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const client = anonClient();
  const session = await client.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'email',
  });
  if (session.error) throw session.error;
  return { client, token: session.data.session.access_token };
}

async function makeUser(label) {
  const email = `${label}.${randomBytes(4).toString('hex')}@srmist.edu.in`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return { id: data.user.id, ...(await signIn(email)) };
}

// Real Auth service: SRMIST-only sign-up (before-user-created hook) and email OTP.
const mailpit = status.MAILPIT_URL ?? 'http://127.0.0.1:54324';
async function latestCodeFor(email) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const list = await res.json();
    const id = list.messages?.[0]?.ID;
    if (id) {
      const msg = await (await fetch(`${mailpit}/api/v1/message/${id}`)).json();
      const code = /code:\s*(\d{6})/.exec(msg.Text ?? '')?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

const otpClient = createClient(url, status.ANON_KEY, { auth: { persistSession: false } });
const gmail = await otpClient.auth.signInWithOtp({
  email: `test.user.${randomBytes(3).toString('hex')}@gmail.com`,
});
check('non-SRMIST email cannot sign up (server hook)', Boolean(gmail.error), gmail.error?.message);

const lookalike = await otpClient.auth.signInWithOtp({
  email: `test.user.${randomBytes(3).toString('hex')}@srmist.edu.in.evil.com`,
});
check('look-alike domain cannot sign up', Boolean(lookalike.error));

const otpEmail = `test.user.${randomBytes(4).toString('hex')}@srmist.edu.in`;
const sent = await otpClient.auth.signInWithOtp({ email: otpEmail });
check('SRMIST email receives a sign-in code', !sent.error, sent.error?.message);
const code = await latestCodeFor(otpEmail);
check('OTP email is delivered with a 6-digit code', Boolean(code));
const wrong = await otpClient.auth.verifyOtp({ email: otpEmail, token: '000000', type: 'email' });
check('a wrong code is rejected', Boolean(wrong.error));
const verified = await otpClient.auth.verifyOtp({
  email: otpEmail,
  token: code ?? '',
  type: 'email',
});
check('the correct code signs the user in', !verified.error && Boolean(verified.data.session));
const otpStatus = await otpClient.rpc('get_my_status');
check(
  'OTP sign-in marks the email step complete on the server',
  otpStatus.data?.steps?.email === true,
);
const replay = await createClient(url, status.ANON_KEY, {
  auth: { persistSession: false },
}).auth.verifyOtp({ email: otpEmail, token: code ?? '', type: 'email' });
check('a used code cannot be replayed', Boolean(replay.error));
if (verified.data?.user) await admin.auth.admin.deleteUser(verified.data.user.id);

// D-046: the emailed code is the only way in, and accounts stay on SRMIST addresses.
const hex = () => randomBytes(4).toString('hex');
const pwSignUp = await anonClient().auth.signUp({
  email: `test.user.${hex()}@srmist.edu.in`,
  password: randomBytes(18).toString('base64url'),
});
check(
  'a password sign-up gets no session (the emailed code is still required)',
  !pwSignUp.data?.session,
  pwSignUp.error?.message,
);
if (pwSignUp.data?.user) {
  const pending = await admin.auth.admin.getUserById(pwSignUp.data.user.id);
  check('a password sign-up is not marked verified', !pending.data?.user?.email_confirmed_at);
  await admin.auth.admin.deleteUser(pwSignUp.data.user.id);
}
const pwEmail = `test.user.${hex()}@srmist.edu.in`;
const pwPassword = randomBytes(18).toString('base64url');
const pwUser = await admin.auth.admin.createUser({
  email: pwEmail,
  password: pwPassword,
  email_confirm: true,
});
const pwSignIn = await anonClient().auth.signInWithPassword({
  email: pwEmail,
  password: pwPassword,
});
check(
  'password sign-in is refused even for a confirmed account',
  Boolean(pwSignIn.error) && !pwSignIn.data?.session,
  pwSignIn.error?.message,
);
if (pwUser.data?.user) await admin.auth.admin.deleteUser(pwUser.data.user.id);

const extraUsers = [];
const userA = await makeUser('test.user.a');
const userB = await makeUser('test.user.b');

try {
  const statusA = await userA.client.rpc('get_my_status');
  check(
    'get_my_status via PostgREST returns incomplete for a new account',
    !statusA.error && statusA.data?.eligibility === 'incomplete',
  );
  check('email confirmation is reflected in server status', statusA.data?.steps?.email === true);

  const selfVerify = await userA.client
    .from('account_private')
    .update({ date_of_birth: '2000-01-01' })
    .eq('id', userA.id);
  check(
    'client cannot write its own date of birth or verification state',
    Boolean(selfVerify.error),
    selfVerify.error?.code,
  );

  const otherProfile = await userA.client.from('profiles').select('id').eq('id', userB.id);
  check(
    'User A cannot read User B profile through the API',
    (otherProfile.data ?? []).length === 0,
  );

  const hook = await userA.client
    .from('profiles')
    .update({ hook: 'Late chai, early runs' })
    .eq('id', userA.id)
    .select('hook');
  check(
    'User A can edit their own hook',
    !hook.error && hook.data?.[0]?.hook === 'Late chai, early runs',
  );

  const moved = await userA.client.auth.updateUser({ email: `test.user.${hex()}@gmail.com` });
  check('an account cannot move to a non-SRMIST email', Boolean(moved.error), moved.error?.message);

  const anon = createClient(url, status.ANON_KEY, { auth: { persistSession: false } });
  const anonRead = await anon.from('profiles').select('id');
  check(
    'anonymous API access to profiles is denied',
    Boolean(anonRead.error) || (anonRead.data ?? []).length === 0,
  );

  const fn = await fetch(`${url}/functions/v1/health`, {
    headers: { Authorization: `Bearer ${userA.token}` },
  });
  const fnBody = await fn.json().catch(() => ({}));
  check(
    'health Edge Function resolves the caller',
    fn.status === 200 && fnBody.user_id === userA.id,
    `HTTP ${fn.status}`,
  );

  const fnNoAuth = await fetch(`${url}/functions/v1/health`);
  check(
    'Edge Function rejects unauthenticated calls',
    fnNoAuth.status === 401,
    `HTTP ${fnNoAuth.status}`,
  );

  // Phase 5 + 6 over the real APIs: photo upload and registration, discovery, and
  // Storage issuing signed URLs only under the discovery visibility rules.
  const terms = (
    await admin.from('app_config').select('value').eq('key', 'current_terms_version').single()
  ).data.value.version;
  const today = new Date();
  const dob = new Date(today.getFullYear() - 22, today.getMonth(), Math.max(1, today.getDate() - 3))
    .toISOString()
    .slice(0, 10);
  for (const [user, gender, showMe] of [
    [userA, 'woman', ['man']],
    [userB, 'man', ['woman']],
  ]) {
    await admin
      .from('account_private')
      .update({ terms_version: terms, terms_accepted_at: today.toISOString(), date_of_birth: dob })
      .eq('id', user.id);
    await user.client
      .from('profiles')
      .update({ display_name: 'Test User', hook: 'Hook', gender })
      .eq('id', user.id);
    await user.client.from('preferences').update({ show_me: showMe }).eq('user_id', user.id);
  }
  // Photo intake (D-043): the app uploads into its private inbox; the profile-photos Edge
  // Function checks the file, strips metadata and publishes the clean copy.
  const withMetadata = readFileSync(fixture('photo-with-metadata.jpg'));
  const tinyJpeg = readFileSync(fixture('photo-tiny.jpg'));
  const squareJpeg = readFileSync(fixture('photo-square.jpg'));
  const jpegType = { contentType: 'image/jpeg' };
  async function sendPhoto(user, full, tiny = tinyJpeg, source = 'camera') {
    const id = randomUUID();
    const inbox = user.client.storage.from('photo-uploads');
    const a = await inbox.upload(`${user.id}/${id}.jpg`, full, jpegType);
    const b = await inbox.upload(`${user.id}/${id}.tiny.jpg`, tiny, jpegType);
    if (a.error || b.error) return { id, upload: a.error ?? b.error };
    const { data, error } = await user.client.functions.invoke('profile-photos', {
      body: { action: 'add', id, source },
    });
    return { id, result: data, error };
  }
  const inboxCount = async (user) =>
    (await admin.storage.from('photo-uploads').list(user.id)).data?.length ?? -1;

  const direct = await userB.client.storage
    .from('profile-photos')
    .upload(`${userB.id}/${randomUUID()}.jpg`, withMetadata, jpegType);
  check('the app cannot publish a photo directly', Boolean(direct.error));
  const intruder = await userA.client.storage
    .from('photo-uploads')
    .upload(`${userB.id}/${randomUUID()}.jpg`, withMetadata, jpegType);
  check("nobody can upload into another student's inbox", Boolean(intruder.error));

  const sent = await sendPhoto(userB, withMetadata);
  const photoId = sent.id;
  const photoPath = `${userB.id}/${photoId}.jpg`;
  check(
    'an uploaded photo is checked, published and registered',
    sent.result?.ok === true,
    JSON.stringify(sent.result ?? sent.error?.message ?? sent.upload?.message),
  );
  const stored = await admin.storage.from('profile-photos').download(photoPath);
  const storedBytes = Buffer.from((await stored.data?.arrayBuffer()) ?? new ArrayBuffer(0));
  const leaked = [
    'Exif',
    'FixtureCam',
    'SERIAL',
    'fixture-xmp',
    'ICC_PROFILE',
    'fixture comment',
    'TRAILING',
  ].filter((text) => storedBytes.includes(Buffer.from(text, 'latin1')));
  check(
    'the published photo carries no metadata (EXIF, GPS, XMP, ICC, comments, trailing bytes)',
    storedBytes.length > 0 && leaked.length === 0,
    leaked.join(', '),
  );
  const row = (
    await admin.from('profile_photos').select('width, height').eq('id', photoId).single()
  ).data;
  check(
    'the photo size is read from the file by the server',
    row?.width === 400 && row?.height === 500,
    JSON.stringify(row),
  );
  check('the inbox is emptied after publishing', (await inboxCount(userB)) === 0);

  const notImage = await sendPhoto(userB, Buffer.from('<html><script>x</script></html>'));
  check(
    'a file that is not a JPEG is refused',
    notImage.result?.ok === false && notImage.result.reason === 'invalid_image',
    JSON.stringify(notImage.result),
  );
  const square = await sendPhoto(userB, squareJpeg);
  check(
    'a photo that is not portrait 4:5 is refused',
    square.result?.ok === false && square.result.reason === 'invalid_size',
    JSON.stringify(square.result),
  );
  const bigTiny = await sendPhoto(userB, withMetadata, withMetadata);
  check(
    'the anonymous-mode copy must really be tiny',
    bigTiny.result?.ok === false && bigTiny.result.reason === 'invalid_size',
    JSON.stringify(bigTiny.result),
  );
  check('refused uploads leave nothing in the inbox', (await inboxCount(userB)) === 0);

  await userB.client.storage.from('profile-photos').remove([photoPath]);
  const survived = await admin.storage.from('profile-photos').list(userB.id);
  check(
    'the app cannot delete or swap a published photo',
    (survived.data ?? []).some((o) => o.name === `${photoId}.jpg`),
  );

  const extra = await sendPhoto(userB, withMetadata, tinyJpeg, 'library');
  const removed = await userB.client.functions.invoke('profile-photos', {
    body: { action: 'remove', id: extra.id },
  });
  const afterRemove = await admin.storage.from('profile-photos').list(userB.id);
  check(
    'removing a photo deletes the row and both files',
    removed.data?.ok === true &&
      !(afterRemove.data ?? []).some((o) => o.name === `${extra.id}.jpg`),
    JSON.stringify(removed.data),
  );

  const preflight = await fetch(`${url}/functions/v1/profile-photos`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://soul-example.vercel.app',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type, x-client-info, apikey',
    },
  });
  check(
    'the web app may call Edge Functions (CORS preflight)',
    preflight.ok && preflight.headers.get('access-control-allow-origin') === '*',
    `HTTP ${preflight.status}`,
  );

  const sentA = await sendPhoto(userA, withMetadata);
  check(
    'a second student can add a photo',
    sentA.result?.ok === true,
    JSON.stringify(sentA.result),
  );
  for (const user of [userA, userB]) {
    const submitted = await user.client.rpc('submit_profile');
    check(
      'a complete profile is accepted',
      submitted.data?.ok === true,
      JSON.stringify(submitted.data),
    );
  }

  const feed = await userA.client.rpc('discovery_feed', { p_exclude: [], p_limit: 50 });
  check(
    'a compatible profile appears in Discover',
    feed.data?.ok === true && feed.data.cards.some((c) => c.id === userB.id),
  );
  const signed = await userA.client.storage.from('profile-photos').createSignedUrl(photoPath, 60);
  check(
    'Storage signs a visible profile photo for another student',
    Boolean(signed.data?.signedUrl),
    signed.error?.message,
  );
  if (signed.data?.signedUrl) {
    const image = await fetch(signed.data.signedUrl);
    check('the signed URL serves the image', image.status === 200, `HTTP ${image.status}`);
  }
  const anonClient = createClient(url, status.ANON_KEY, { auth: { persistSession: false } });
  const anonSign = await anonClient.storage.from('profile-photos').createSignedUrl(photoPath, 60);
  check('signed-out requests cannot sign profile photos', Boolean(anonSign.error));

  await userB.client.from('profiles').update({ privacy_mode: 'private' }).eq('id', userB.id);
  const hidden = await userA.client.storage.from('profile-photos').createSignedUrl(photoPath, 60);
  check('private mode stops others from signing the photo', Boolean(hidden.error));

  await userB.client.from('profiles').update({ privacy_mode: 'anonymous' }).eq('id', userB.id);
  const original = await userA.client.storage.from('profile-photos').createSignedUrl(photoPath, 60);
  const blurred = await userA.client.storage
    .from('profile-photos-blurred')
    .createSignedUrl(photoPath, 60);
  check(
    'anonymous mode serves only the blurred copy',
    Boolean(original.error) && Boolean(blurred.data?.signedUrl),
    `original ${original.error ? 'refused' : 'signed'}, blurred ${blurred.error?.message ?? 'signed'}`,
  );

  const like = await userA.client.rpc('swipe_right', {
    p_target: userB.id,
    p_idempotency_key: randomUUID(),
  });
  check('a like is recorded through the API', like.data?.ok === true, JSON.stringify(like.data));

  // Phase 7: swipe credits. Parallel requests over real HTTP must never overspend.
  check(
    'the first like used one of the 4 free swipes',
    like.data?.balance === 3,
    JSON.stringify(like.data),
  );
  const catalog = await userA.client.from('plans').select('id, price_paise, right_swipes');
  check(
    'the app can read the plan catalog',
    (catalog.data ?? []).length === 7 &&
      catalog.data.find((plan) => plan.id === 'monthly')?.price_paise === 19900,
  );
  const selfGrant = await userA.client.rpc('activate_plan', {
    p_user: userA.id,
    p_plan: 'half_year',
    p_key: 'self-granted',
  });
  check('the app cannot activate a plan itself', Boolean(selfGrant.error), selfGrant.error?.code);

  // Seven more profiles User A may like, written the way the server would publish them.
  const targets = [];
  const targetEmail = new Map();
  for (let n = 0; n < 7; n += 1) {
    const email = `test.user.t${n}.${hex()}@srmist.edu.in`;
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    const id = created.data.user.id;
    extraUsers.push(id);
    targets.push(id);
    targetEmail.set(id, email);
    await admin
      .from('account_private')
      .update({
        terms_version: terms,
        terms_accepted_at: today.toISOString(),
        date_of_birth: dob,
        profile_completed_at: today.toISOString(),
      })
      .eq('id', id);
    await admin
      .from('profiles')
      .update({ display_name: 'Test User', hook: 'Hook', gender: 'man' })
      .eq('id', id);
    await admin
      .from('preferences')
      .update({ show_me: ['woman'] })
      .eq('user_id', id);
    const photo = randomUUID();
    const path = `${id}/${photo}.jpg`;
    await admin.storage.from('profile-photos').upload(path, tinyJpeg, jpegType);
    await admin.storage.from('profile-photos-blurred').upload(path, tinyJpeg, jpegType);
    await admin.from('profile_photos').insert({
      id: photo,
      user_id: id,
      storage_path: path,
      blurred_path: path,
      position: 0,
      status: 'approved',
      source: 'camera',
      width: 1080,
      height: 1350,
    });
  }

  const burst = await Promise.all(
    targets.map((target) =>
      userA.client.rpc('swipe_right', { p_target: target, p_idempotency_key: randomUUID() }),
    ),
  );
  const charged = burst.filter((r) => r.data?.ok === true).length;
  const refused = burst.filter((r) => r.data?.reason === 'no_swipes').length;
  check(
    '7 parallel likes with 3 swipes left: exactly 3 go through',
    charged === 3 && refused === 4,
    `${charged} charged, ${refused} refused`,
  );
  const afterBurst = await userA.client.rpc('get_my_swipes');
  const likeCount = async () =>
    (await admin.from('likes').select('*', { count: 'exact', head: true }).eq('liker_id', userA.id))
      .count;
  check(
    'the balance is 0 and only charged likes were saved',
    afterBurst.data?.balance === 0 && (await likeCount()) === 4,
    `balance ${afterBurst.data?.balance}, likes ${await likeCount()}`,
  );

  const paid = await admin.rpc('activate_plan', {
    p_user: userA.id,
    p_plan: 'topup_5',
    p_key: `verify-${hex()}`,
  });
  check('a verified payment adds a top-up', paid.data?.ok === true, JSON.stringify(paid.data));
  const unliked = targets.filter((_, index) => burst[index].data?.reason === 'no_swipes');
  const sameKey = randomUUID();
  const replays = await Promise.all(
    Array.from({ length: 5 }, () =>
      userA.client.rpc('swipe_right', { p_target: unliked[0], p_idempotency_key: sameKey }),
    ),
  );
  const differentKeys = await Promise.all(
    Array.from({ length: 5 }, () =>
      userA.client.rpc('swipe_right', { p_target: unliked[1], p_idempotency_key: randomUUID() }),
    ),
  );
  const afterReplays = await userA.client.rpc('get_my_swipes');
  check(
    '10 parallel requests for 2 people cost exactly 2 swipes (no double charge)',
    afterReplays.data?.balance === 3 &&
      [...replays, ...differentKeys].every((r) => r.data?.ok === true),
    `balance ${afterReplays.data?.balance}`,
  );

  // Phase 8: two people liking each other at the same moment make exactly one match.
  const matchRows = async (one, other) =>
    (
      await admin
        .from('matches')
        .select('id, active')
        .or(`and(user_a.eq.${one},user_b.eq.${other}),and(user_a.eq.${other},user_b.eq.${one})`)
    ).data ?? [];
  const mutual = [];
  for (const target of [unliked[2], unliked[3]]) {
    const other = await signIn(targetEmail.get(target));
    const [mine, theirs] = await Promise.all([
      userA.client.rpc('swipe_right', { p_target: target, p_idempotency_key: randomUUID() }),
      other.client.rpc('swipe_right', { p_target: userA.id, p_idempotency_key: randomUUID() }),
    ]);
    const rows = await matchRows(userA.id, target);
    mutual.push({
      target,
      other,
      rows: rows.length,
      announced: [mine, theirs].filter((r) => r.data?.match).length,
      bothLiked: mine.data?.ok === true && theirs.data?.ok === true,
      id: rows[0]?.id,
    });
  }
  check(
    'simultaneous mutual likes create exactly one match per pair',
    mutual.every((m) => m.rows === 1 && m.bothLiked),
    mutual.map((m) => `${m.rows} row(s)`).join(', '),
  );
  check(
    'the match is announced to exactly one of the two requests (the later one)',
    mutual.every((m) => m.announced === 1),
    mutual.map((m) => `${m.announced} announced`).join(', '),
  );
  const afterMatches = await userA.client.rpc('get_my_swipes');
  check(
    'each matching like cost one swipe, once',
    afterMatches.data?.balance === 1,
    `balance ${afterMatches.data?.balance}`,
  );
  const myMatches = await userA.client.rpc('get_my_matches');
  check(
    'both matches are in the match list, unseen',
    myMatches.data?.matches?.length === 2 && myMatches.data.matches.every((m) => m.seen === false),
    JSON.stringify(myMatches.data?.matches?.map((m) => m.seen)),
  );
  const directRead = await userA.client.from('matches').select('id');
  check('the app cannot read the matches table directly', Boolean(directRead.error));

  const ended = await mutual[0].other.client.rpc('unmatch', { p_match: mutual[0].id });
  const listAfter = await userA.client.rpc('get_my_matches');
  const cardAfter = await userA.client.rpc('get_profile_card', { p_target: mutual[0].target });
  check(
    'either person can unmatch; the other no longer sees them',
    ended.data?.ok === true &&
      listAfter.data?.matches?.length === 1 &&
      cardAfter.data?.reason === 'not_available',
    `list ${listAfter.data?.matches?.length}, card ${JSON.stringify(cardAfter.data)}`,
  );

  // Phase 9: chat over real Realtime sockets, with two signed-in clients and one outsider.
  const chatMatch = listAfter.data.matches[0];
  const conversation = chatMatch.conversation_id;
  const partner = mutual[1].other;
  const partnerId = mutual[1].target;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Joins a private topic and collects every broadcast event it receives. */
  async function join(client, topic) {
    const events = [];
    const channel = client.channel(topic, { config: { private: true } });
    for (const event of ['message', 'read', 'closed', 'typing', 'refresh']) {
      channel.on('broadcast', { event }, (received) => events.push(received));
    }
    const status = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve('TIMED_OUT'), 8000);
      channel.subscribe((state) => {
        if (state === 'SUBSCRIBED' || state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
          clearTimeout(timer);
          resolve(state);
        }
      });
    });
    return { channel, events, status };
  }
  const received = async (events, test, ms = 5000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (events.some(test)) return true;
      await sleep(100);
    }
    return false;
  };

  const mine = await join(userA.client, `chat:${conversation}`);
  const theirs = await join(partner.client, `chat:${conversation}`);
  const theirInbox = await join(partner.client, `user:${partnerId}`);
  check(
    'both people can join their private chat topic',
    mine.status === 'SUBSCRIBED' && theirs.status === 'SUBSCRIBED',
    `${mine.status}, ${theirs.status}`,
  );
  const outsider = await join(userB.client, `chat:${conversation}`);
  check(
    'an outsider cannot join the chat topic',
    outsider.status !== 'SUBSCRIBED',
    outsider.status,
  );
  const spy = await join(userB.client, `user:${userA.id}`);
  check("nobody can join another account's topic", spy.status !== 'SUBSCRIBED', spy.status);

  const clientId = randomUUID();
  const sentMessage = await userA.client.rpc('send_message', {
    p_conversation: conversation,
    p_body: '  hello from the test  ',
    p_client_id: clientId,
  });
  check(
    'a message is stored and returned trimmed',
    sentMessage.data?.ok === true && sentMessage.data.message.body === 'hello from the test',
    JSON.stringify(sentMessage.data),
  );
  check(
    'the other person receives it over Realtime',
    await received(
      theirs.events,
      (e) =>
        e.event === 'message' &&
        e.payload.client_id === clientId &&
        e.payload.sender_id === userA.id,
    ),
  );
  check(
    "the other person's account topic is nudged (chat list and unread)",
    await received(
      theirInbox.events,
      (e) => e.event === 'refresh' && e.payload.reason === 'message',
    ),
  );
  const again = await userA.client.rpc('send_message', {
    p_conversation: conversation,
    p_body: 'hello from the test',
    p_client_id: clientId,
  });
  check(
    'a retry of the same message is not stored twice',
    again.data?.replayed === true && again.data.message.id === sentMessage.data.message.id,
  );

  // A client cannot publish on the chat topic: a forged "message" never reaches the other person.
  await mine.channel.send({
    type: 'broadcast',
    event: 'message',
    payload: { body: 'forged', sender_id: partnerId, client_id: 'forged' },
  });
  check(
    'a forged message broadcast is not delivered',
    !(await received(theirs.events, (e) => e.payload?.client_id === 'forged', 2000)),
  );

  const myTyping = await join(userA.client, `typing:${conversation}`);
  const theirTyping = await join(partner.client, `typing:${conversation}`);
  await myTyping.channel.send({ type: 'broadcast', event: 'typing', payload: { typing: true } });
  check(
    'typing reaches the other person on the typing topic',
    myTyping.status === 'SUBSCRIBED' &&
      (await received(
        theirTyping.events,
        (e) => e.event === 'typing' && e.payload.typing === true,
      )),
    `${myTyping.status}, ${theirTyping.status}`,
  );

  const readNow = await partner.client.rpc('mark_conversation_read', {
    p_conversation: conversation,
    p_message: sentMessage.data.message.id,
  });
  check(
    'a read receipt reaches the sender',
    readNow.data?.ok === true &&
      (await received(
        mine.events,
        (e) => e.event === 'read' && e.payload.message_id === sentMessage.data.message.id,
      )),
  );
  const page = await partner.client.rpc('get_messages', { p_conversation: conversation });
  check(
    'the conversation history is readable by its members only',
    page.data?.messages?.[0]?.body === 'hello from the test' &&
      (await userB.client.rpc('get_messages', { p_conversation: conversation })).data?.reason ===
        'not_available',
  );

  await partner.client.rpc('unmatch', { p_match: chatMatch.id });
  check(
    'unmatching closes the conversation for both devices',
    (await received(mine.events, (e) => e.event === 'closed')) &&
      (
        await userA.client.rpc('send_message', {
          p_conversation: conversation,
          p_body: 'after',
          p_client_id: randomUUID(),
        })
      ).data?.reason === 'not_available',
  );
  // Phase 12: billing over HTTP. The local stack runs the mock provider, which posts
  // Razorpay-shaped events signed with the webhook secret to the real webhook function.
  const fnUrl = (name) => `${url}/functions/v1/${name}`;
  const anonCheckout = await fetch(fnUrl('payments-checkout'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ plan: 'weekly', platform: 'web' }),
  });
  check(
    'checkout needs a signed-in student',
    anonCheckout.status === 401,
    `HTTP ${anonCheckout.status}`,
  );
  const balanceOf = async (user) => (await user.client.rpc('get_my_swipes')).data?.balance ?? null;
  const balanceBefore = await balanceOf(userB);
  const checkout = await userB.client.functions.invoke('payments-checkout', {
    body: { plan: 'weekly', platform: 'web' },
  });
  const orderId = checkout.data?.order_id;
  check(
    'checkout creates an order for a catalog item',
    checkout.data?.ok === true && checkout.data?.provider === 'mock' && typeof orderId === 'string',
    JSON.stringify(checkout.data ?? checkout.error?.message),
  );
  const priced = await userB.client.functions.invoke('payments-checkout', {
    body: { plan: 'weekly', platform: 'web', amount: 1, amount_paise: 1 },
  });
  const pricedOrder = priced.data?.order_id
    ? await userB.client.rpc('get_payment', { p_order: priced.data.order_id })
    : null;
  check(
    'a price sent by the app is ignored: the order costs what the catalog says',
    pricedOrder?.data?.payment?.amount_paise === 6900,
    JSON.stringify(pricedOrder?.data?.payment?.amount_paise ?? priced.data),
  );
  const forgedBody = JSON.stringify({
    event: 'payment_link.paid',
    payload: {
      payment_link: { entity: { id: 'plink_x', reference_id: orderId, currency: 'INR' } },
      payment: { entity: { id: 'pay_forged', amount: 6900, currency: 'INR' } },
    },
  });
  const unsigned = await fetch(fnUrl('payments-webhook'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: forgedBody,
  });
  const wronglySigned = await fetch(fnUrl('payments-webhook'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'a'.repeat(64) },
    body: forgedBody,
  });
  const stillPending = await userB.client.rpc('get_payment', { p_order: orderId });
  check(
    'a webhook without a valid signature is refused and grants nothing',
    unsigned.status === 401 &&
      wronglySigned.status === 401 &&
      stillPending.data?.payment?.status === 'created',
    `${unsigned.status}, ${wronglySigned.status}, ${stillPending.data?.payment?.status}`,
  );
  const payIntruder = await userA.client.functions.invoke('payments-mock', {
    body: { order_id: orderId, outcome: 'paid' },
  });
  check("nobody can pay another student's order", Boolean(payIntruder.error));

  const buyerInbox = await join(userB.client, `user:${userB.id}`);
  const paidNow = await userB.client.functions.invoke('payments-mock', {
    body: { order_id: orderId, outcome: 'paid' },
  });
  const afterPay = await userB.client.rpc('get_payment', { p_order: orderId });
  const balancePaid = await balanceOf(userB);
  check(
    'a signed payment event grants the plan, and the phone is told at once',
    paidNow.data?.result === 'granted' &&
      afterPay.data?.payment?.status === 'paid' &&
      balancePaid === balanceBefore + 15 &&
      (await received(
        buyerInbox.events,
        (e) => e.event === 'refresh' && e.payload.reason === 'payment',
      )),
    JSON.stringify({ result: paidNow.data?.result, before: balanceBefore, after: balancePaid }),
  );
  const paidAgain = await userB.client.functions.invoke('payments-mock', {
    body: { order_id: orderId, outcome: 'paid' },
  });
  check(
    'a second payment event for the same order grants nothing',
    paidAgain.data?.result?.startsWith('refused') && (await balanceOf(userB)) === balancePaid,
    paidAgain.data?.result,
  );
  const synced = await userB.client.functions.invoke('payments-sync', { body: {} });
  check('the app can ask the server to re-check its purchases', synced.data?.ok === true);
  const refundedNow = await userB.client.functions.invoke('payments-mock', {
    body: { order_id: orderId, outcome: 'refund' },
  });
  const afterRefund = await userB.client.rpc('get_payment', { p_order: orderId });
  check(
    'a full refund revokes the unused likes',
    refundedNow.data?.result === 'revoked' &&
      afterRefund.data?.payment?.status === 'refunded' &&
      (await balanceOf(userB)) === balanceBefore,
    JSON.stringify({ result: refundedNow.data?.result, balance: await balanceOf(userB) }),
  );
  await buyerInbox.channel.unsubscribe();
  // Phase 13: safety over HTTP.
  const queueForStudent = await userA.client.rpc('moderation_queue');
  check('only moderators can open the moderation queue', queueForStudent.error?.code === '42501');
  const reported = await userA.client.rpc('report_user', {
    p_target: userB.id,
    p_category: 'spam',
    p_details: 'Test report',
    p_context: 'profile',
    p_block: false,
  });
  const reportsTable = await userA.client.from('reports').select('*');
  check(
    'a report is accepted, and reports are unreadable to the app',
    reported.data?.ok === true && Boolean(reportsTable.error),
    JSON.stringify(reported.data),
  );
  const blocked = await userA.client.rpc('block_user', { p_target: userB.id });
  const seenByBlocked = await userB.client.rpc('get_profile_card', { p_target: userA.id });
  const blockRowsSeenByBlocked = await userB.client.from('blocks').select('*');
  check(
    'a block hides both people from each other, and the blocked one cannot see it',
    blocked.data?.ok === true &&
      seenByBlocked.data?.reason === 'not_available' &&
      (blockRowsSeenByBlocked.data ?? []).length === 0,
    JSON.stringify({ card: seenByBlocked.data, rows: blockRowsSeenByBlocked.data?.length }),
  );
  await userA.client.rpc('unblock_user', { p_target: userB.id });

  const leaving = await makeUser('test.user.leaving');
  const noConfirm = await leaving.client.functions.invoke('account-delete', { body: {} });
  check('deleting an account needs an explicit confirmation', Boolean(noConfirm.error));
  const deletedNow = await leaving.client.functions.invoke('account-delete', {
    body: { confirm: 'DELETE' },
  });
  const stillThere = await admin.auth.admin.getUserById(leaving.id);
  const refreshAfter = await leaving.client.auth.refreshSession();
  check(
    'deleting an account removes it at once and ends its sessions',
    deletedNow.data?.ok === true && !stillThere.data?.user && Boolean(refreshAfter.error),
    JSON.stringify({ deleted: deletedNow.data, refresh: refreshAfter.error?.message }),
  );
  for (const client of [userA.client, partner.client, userB.client])
    await client.removeAllChannels();

  // Phase 14: push devices over HTTP (D-054). Registered and removed again at once, so nothing
  // is ever sent to the push service from this script.
  const channels = await userA.client.functions.invoke('push-register', { method: 'GET' });
  check(
    'the push channels and the public VAPID key are published',
    channels.data?.ok === true && typeof channels.data?.web?.publicKey === 'string',
    JSON.stringify(channels.data),
  );
  const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
  const auth = Buffer.alloc(16, 9).toString('base64url');
  const elsewhere = await userA.client.functions.invoke('push-register', {
    body: {
      action: 'register',
      device: { platform: 'web', endpoint: 'https://example.invalid/push', keys: { p256dh, auth } },
    },
  });
  check('a subscription outside the known push services is refused', Boolean(elsewhere.error));
  const endpoint = `https://fcm.googleapis.com/fcm/send/verify-${Date.now()}`;
  const registered = await userA.client.functions.invoke('push-register', {
    body: { action: 'register', device: { platform: 'web', endpoint, keys: { p256dh, auth } } },
  });
  const devicesTable = await userA.client.from('push_devices').select('*');
  const settingsNow = await userA.client.rpc('get_notification_settings');
  check(
    'a device registers through the server only, and the app cannot read devices',
    registered.data?.ok === true && Boolean(devicesTable.error) && settingsNow.data?.devices >= 1,
    JSON.stringify({ registered: registered.data, settings: settingsNow.data }),
  );
  const unregistered = await userA.client.functions.invoke('push-register', {
    body: { action: 'unregister', endpoint },
  });
  check(
    'signing out removes the device',
    unregistered.data?.removed === 1,
    JSON.stringify(unregistered.data),
  );
  const claimByApp = await userA.client.rpc('push_claim', { p_limit: 10 });
  check('the app cannot take notifications from the outbox', Boolean(claimByApp.error));

  // Phase 15: admin over HTTP (D-055). Roles live only in the database; the app just calls.
  const plansByStudent = await userA.client.rpc('admin_list_plans');
  check('a student cannot open admin tools', plansByStudent.error?.code === '42501');
  const moderator = await makeUser('test.user.moderator');
  await admin.from('admin_roles').insert({ user_id: moderator.id, role: 'moderator' });
  const detailByModerator = await moderator.client.rpc('admin_account_detail', {
    p_user: userB.id,
  });
  const flagsByModerator = await moderator.client.rpc('admin_set_flag', {
    p_key: 'payments_open',
    p_value: false,
  });
  check(
    'a moderator can open an account but not admin-only tools',
    detailByModerator.data?.ok === true &&
      typeof detailByModerator.data?.email === 'string' &&
      !('date_of_birth' in (detailByModerator.data ?? {})) &&
      flagsByModerator.error?.code === '42501',
    JSON.stringify({ detail: detailByModerator.data?.ok, flags: flagsByModerator.error?.code }),
  );
  const appealing = await makeUser('test.user.appealing');
  await admin.from('account_private').update({ account_state: 'suspended' }).eq('id', appealing.id);
  const appealed = await appealing.client.rpc('submit_appeal', { p_message: 'Please look again' });
  const appealsTable = await appealing.client.from('appeals').select('*');
  const queueWithAppeal = await moderator.client.rpc('moderation_queue');
  check(
    'a suspended person can ask for a review, which reaches moderators only',
    appealed.data?.ok === true &&
      Boolean(appealsTable.error) &&
      (queueWithAppeal.data?.appeals ?? []).some((a) => a.user_id === appealing.id),
    JSON.stringify({ appealed: appealed.data, table: appealsTable.error?.code }),
  );

  // Phase 10: Instant Meet over real HTTP and Realtime. Positions go in; only rounded,
  // derived values come out, and only after both people accept (spec 26 to 34, D-050).
  const base = { lat: 12.823, lng: 80.045 };
  const north = (metres) => ({ lat: base.lat + metres / 110574, lng: base.lng });
  const report = (client, point) =>
    client.rpc('instant_update_location', {
      p_latitude: point.lat,
      p_longitude: point.lng,
      p_accuracy: 12,
    });
  const coordinateLeak = (value) => {
    const text = JSON.stringify(value ?? null);
    return /12\.8[0-9]|80\.0[0-9]|"(latitude|longitude|location|lat|lng|accuracy_m)"/.test(text);
  };

  const noPlan = await userA.client.rpc('instant_start', { p_minutes: 30 });
  check(
    'Instant Meet needs a plan that includes it (top-ups never unlock it)',
    noPlan.data?.reason === 'no_plan',
    JSON.stringify(noPlan.data),
  );
  const likedOnly = targets.filter((_, index) => burst[index].data?.ok === true);
  const [nearId, farId] = likedOnly;
  const nearUser = await signIn(targetEmail.get(nearId));
  const farUser = await signIn(targetEmail.get(farId));
  for (const id of [userA.id, nearId, farId]) {
    await admin.rpc('activate_plan', { p_user: id, p_plan: 'monthly', p_key: `verify-${hex()}` });
  }
  const before = await userA.client.rpc('instant_update_location', {
    p_latitude: base.lat,
    p_longitude: base.lng,
    p_accuracy: 10,
  });
  check(
    'no position is taken before Instant is turned on',
    before.data?.reason === 'not_active',
    JSON.stringify(before.data),
  );
  const started = await Promise.all(
    [userA, nearUser, farUser].map((user) => user.client.rpc('instant_start', { p_minutes: 30 })),
  );
  check(
    'a monthly plan can turn Instant on',
    started.every((result) => result.data?.ok === true),
    JSON.stringify(started.map((result) => result.data)),
  );
  await Promise.all([
    report(userA.client, base),
    report(nearUser.client, north(200)),
    report(farUser.client, north(1400)),
  ]);
  const found = await userA.client.rpc('instant_candidates');
  const foundIds = (found.data?.candidates ?? []).map((candidate) => candidate.id);
  check(
    'someone 200 m away is a candidate; someone 1.4 km away is not',
    foundIds.includes(nearId) && !foundIds.includes(farId),
    JSON.stringify(foundIds),
  );
  check(
    'the candidate list carries no coordinate or distance',
    !coordinateLeak(found.data) && !JSON.stringify(found.data).includes('distance_m'),
  );

  const presence = await userA.client.schema('private').from('instant_presence').select('*');
  const sessionsTable = await userA.client.from('instant_sessions').select('*');
  check(
    'no client can read stored positions or the sessions table',
    Boolean(presence.error) && Boolean(sessionsTable.error),
    `${presence.error?.code}, ${sessionsTable.error?.code}`,
  );

  const nearInbox = await join(nearUser.client, `user:${nearId}`);
  const firstYes = await userA.client.rpc('instant_accept', { p_candidate: nearId });
  const waitingState = await nearUser.client.rpc('instant_state');
  check(
    'one yes shares nothing',
    firstYes.data?.ok === true &&
      firstYes.data.session === null &&
      waitingState.data?.session === null,
  );
  const secondYes = await nearUser.client.rpc('instant_accept', { p_candidate: userA.id });
  check(
    'the second yes starts the session and nudges both phones',
    typeof secondYes.data?.session === 'string' &&
      (await received(
        nearInbox.events,
        (e) => e.event === 'refresh' && e.payload.reason === 'instant',
      )),
    JSON.stringify(secondYes.data),
  );
  const live = await userA.client.rpc('instant_state');
  const liveSession = live.data?.session;
  check(
    'during the session: a rounded distance and a 15-degree bearing only',
    liveSession?.distance_m === 200 && liveSession?.bearing === 0 && !coordinateLeak(live.data),
    JSON.stringify({ distance: liveSession?.distance_m, bearing: liveSession?.bearing }),
  );
  await new Promise((resolve) => setTimeout(resolve, 2100));
  const teleport = await report(nearUser.client, north(5200));
  check(
    'a position that jumps 5 km in two seconds is refused',
    teleport.data?.reason === 'implausible',
    JSON.stringify(teleport.data),
  );
  await new Promise((resolve) => setTimeout(resolve, 2100));
  await report(nearUser.client, north(60));
  const close = await userA.client.rpc('instant_state');
  check(
    'under 100 m only "nearby": no number, no direction',
    close.data?.session?.nearby === true &&
      close.data.session.distance_m === null &&
      close.data.session.bearing === null,
    JSON.stringify(close.data?.session),
  );

  const meetChat = liveSession?.conversation_id;
  const meetMine = await join(userA.client, `chat:${meetChat}`);
  const meetOutsider = await join(userB.client, `chat:${meetChat}`);
  const meetMessage = await nearUser.client.rpc('send_message', {
    p_conversation: meetChat,
    p_body: 'on my way',
    p_client_id: randomUUID(),
  });
  check(
    'the two people can chat during the session; nobody else can listen',
    meetMine.status === 'SUBSCRIBED' &&
      meetOutsider.status !== 'SUBSCRIBED' &&
      meetMessage.data?.ok === true &&
      (await received(meetMine.events, (e) => e.event === 'message')),
    `${meetMine.status}, ${meetOutsider.status}`,
  );

  // End Meet: one person ends it for both, at once, with no consent from the other.
  const ending = await nearUser.client.rpc('instant_end_session');
  const afterEnd = await userA.client.rpc('instant_state');
  const lateMessage = await userA.client.rpc('send_message', {
    p_conversation: meetChat,
    p_body: 'still there?',
    p_client_id: randomUUID(),
  });
  check(
    'End Meet stops sharing for both at once and closes the chat',
    ending.data?.ended === true &&
      afterEnd.data?.session === null &&
      afterEnd.data?.active === false &&
      afterEnd.data?.located === false &&
      lateMessage.data?.reason === 'not_available' &&
      (await received(meetMine.events, (e) => e.event === 'closed')),
    JSON.stringify(afterEnd.data),
  );
  const rejoin = await join(nearUser.client, `chat:${meetChat}`);
  const nearAfter = await nearUser.client.rpc('instant_candidates');
  check(
    'after the end: the chat topic is refused and nothing more is shared',
    rejoin.status !== 'SUBSCRIBED' && (nearAfter.data?.candidates ?? []).length === 0,
    rejoin.status,
  );
  // Phase 11: "Did you meet?" over HTTP. The pair just met through Instant Meet.
  const askFirst = await userA.client.rpc('date_state', { p_other: nearId });
  check(
    'after an Instant Meet the two can confirm they met',
    askFirst.data?.state === 'ask' && askFirst.data?.source === 'instant',
    JSON.stringify({ state: askFirst.data?.state, source: askFirst.data?.source }),
  );
  const firstYesDate = await userA.client.rpc('answer_date', { p_other: nearId, p_met: true });
  const otherView = await nearUser.client.rpc('date_state', { p_other: userA.id });
  check(
    'a first yes is invisible to the other person',
    firstYesDate.data?.state === 'waiting' &&
      otherView.data?.state === 'ask' &&
      otherView.data?.closes_at === null &&
      otherView.data?.last === null,
    JSON.stringify({ mine: firstYesDate.data?.state, theirs: otherView.data?.state }),
  );
  const myInbox = await join(userA.client, `user:${userA.id}`);
  const secondYesDate = await nearUser.client.rpc('answer_date', {
    p_other: userA.id,
    p_met: true,
  });
  check(
    'the second yes confirms the date and nudges the first phone',
    secondYesDate.data?.state === 'confirmed' &&
      (await received(myInbox.events, (e) => e.event === 'refresh' && e.payload.reason === 'date')),
    JSON.stringify(secondYesDate.data),
  );
  const repeatDate = await userA.client.rpc('answer_date', { p_other: nearId, p_met: true });
  const progress = await userA.client.rpc('get_my_dates');
  check(
    'the same encounter cannot be counted twice; the owner sees their private count',
    repeatDate.data?.reason === 'cooldown' &&
      progress.data?.count === 1 &&
      progress.data?.active === false,
    JSON.stringify({ repeat: repeatDate.data, count: progress.data?.count }),
  );
  const roundsTable = await userA.client.from('date_rounds').select('*');
  const outsiderDate = await userB.client.rpc('date_state', { p_other: userA.id });
  const selfGrantDate = await userA.client.rpc('invalidate_date', {
    p_round: randomUUID(),
    p_reason: 'test',
  });
  check(
    'answers are unreadable, outsiders cannot confirm, only moderators invalidate',
    Boolean(roundsTable.error) &&
      outsiderDate.data?.reason === 'not_available' &&
      selfGrantDate.error?.code === '42501',
    `${roundsTable.error?.code}, ${outsiderDate.data?.reason}, ${selfGrantDate.error?.code}`,
  );
  await myInbox.channel.unsubscribe();
  await farUser.client.rpc('instant_stop');
  for (const client of [nearUser.client, farUser.client]) await client.removeAllChannels();
} finally {
  for (const id of [userA.id, userB.id, ...extraUsers]) {
    for (const bucket of ['profile-photos', 'profile-photos-blurred', 'photo-uploads']) {
      const listed = await admin.storage.from(bucket).list(id);
      const names = (listed.data ?? []).map((o) => `${id}/${o.name}`);
      if (names.length) await admin.storage.from(bucket).remove(names);
    }
    await admin.auth.admin.deleteUser(id);
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
