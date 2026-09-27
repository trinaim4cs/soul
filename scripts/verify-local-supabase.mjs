// End-to-end check of the local Supabase stack over HTTP (Phase 3).
// Uses the local development stack only: keys come from `supabase status`, never from files.
// Identities are neutral test users and are deleted afterwards.
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

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
} finally {
  await admin.auth.admin.deleteUser(userA.id);
  await admin.auth.admin.deleteUser(userB.id);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
