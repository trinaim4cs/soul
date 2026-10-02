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
