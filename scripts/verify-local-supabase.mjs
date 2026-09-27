// End-to-end check of the local Supabase stack over HTTP (Phase 3).
// Uses the local development stack only: keys come from `supabase status`, never from files.
// Identities are neutral test users and are deleted afterwards.
import { execSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
const url = status.API_URL;
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  throw new Error(`Refusing to run against a non-local Supabase: ${url}`);
}
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

async function makeUser(label) {
  const password = randomBytes(18).toString('base64url');
  const email = `${label}.${randomBytes(4).toString('hex')}@srmist.edu.in`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const client = createClient(url, status.ANON_KEY, { auth: { persistSession: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, client, token: signIn.data.session.access_token };
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
  // A 1 x 1 JPEG: the server checks the objects exist in the owner's folders, not the pixels.
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64',
  );
  const photoId = randomUUID();
  const photoPath = `${userB.id}/${photoId}.jpg`;
  const upload = await userB.client.storage
    .from('profile-photos')
    .upload(photoPath, jpeg, { contentType: 'image/jpeg' });
  const uploadTiny = await userB.client.storage
    .from('profile-photos-blurred')
    .upload(photoPath, jpeg, { contentType: 'image/jpeg' });
  check(
    'an owner can upload into their own photo folders',
    !upload.error && !uploadTiny.error,
    upload.error?.message,
  );
  const intruder = await userA.client.storage
    .from('profile-photos')
    .upload(`${userB.id}/${randomUUID()}.jpg`, jpeg, { contentType: 'image/jpeg' });
  check("nobody can upload into another user's photo folder", Boolean(intruder.error));
  const registered = await userB.client.rpc('add_profile_photo', {
    p_id: photoId,
    p_width: 1080,
    p_height: 1350,
    p_source: 'camera',
  });
  check(
    'an uploaded photo is registered',
    registered.data?.ok === true,
    JSON.stringify(registered.data),
  );
  for (const user of [userA, userB]) {
    if (user === userA) {
      const aId = randomUUID();
      await userA.client.storage
        .from('profile-photos')
        .upload(`${userA.id}/${aId}.jpg`, jpeg, { contentType: 'image/jpeg' });
      await userA.client.storage
        .from('profile-photos-blurred')
        .upload(`${userA.id}/${aId}.jpg`, jpeg, { contentType: 'image/jpeg' });
      await userA.client.rpc('add_profile_photo', {
        p_id: aId,
        p_width: 1080,
        p_height: 1350,
        p_source: 'camera',
      });
    }
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

  await userB.client.storage.from('profile-photos').remove([photoPath]);
  await userB.client.storage.from('profile-photos-blurred').remove([photoPath]);
} finally {
  await admin.auth.admin.deleteUser(userA.id);
  await admin.auth.admin.deleteUser(userB.id);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
