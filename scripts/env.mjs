// SOUL environment files (BUILD_ANDROID.md "Environment", SUPABASE.md).
//
//   npm run env:init -- development|production   create missing env files from their templates
//   npm run env:check -- development|production  check every value, printing none of them
//                         [--app]                only the app values (enough to build it)
//
// Files (all git-ignored; the *.example templates are committed):
//   .env                               app, local development
//   .env.production                    app, production (release APK and the website)
//   supabase/functions/.env            server secrets, local stack
//   supabase/functions/.env.production server secrets, hosted project (`supabase secrets set`)
//
// `init` never overwrites a value that is already set. It fills in what it can safely make on
// this machine: Web Push keys and, locally, a webhook secret and the local publishable key. A
// secret is written straight into its file and never printed.
import { createECDH, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
// --app: only what building the app needs (the release script uses it).
const appOnly = args.includes('--app');
const [command, mode = 'development'] = args.filter((arg) => !arg.startsWith('--'));
if (!['init', 'check'].includes(command) || !['development', 'production'].includes(mode)) {
  console.error('Usage: node scripts/env.mjs init|check development|production');
  process.exit(2);
}
const production = mode === 'production';
const files = {
  app: production ? '.env.production' : '.env',
  server: production ? 'supabase/functions/.env.production' : 'supabase/functions/.env',
};
const templates = {
  app: production ? '.env.production.example' : '.env.example',
  server: production
    ? 'supabase/functions/.env.production.example'
    : 'supabase/functions/.env.example',
};

/** KEY=value lines; comments and blank lines skipped; an unquoted value ends at " #". */
function parse(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at < 1) continue;
    let value = line.slice(at + 1).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '').trim();
    values[line.slice(0, at).trim()] = value;
  }
  return values;
}

const read = (path) => (existsSync(path) ? parse(readFileSync(path, 'utf8')) : null);

/** Sets KEY's value in the file text, keeping every other line and comment as it was. */
function setValue(text, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(text)
    ? text.replace(pattern, `${key}=${value}`)
    : `${text.trimEnd()}\n${key}=${value}\n`;
}

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
function vapidPair() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(ecdh.getPrivateKey()) };
}

function localPublishableKey() {
  try {
    const status = JSON.parse(
      execSync('npx supabase status -o json', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
    return status.PUBLISHABLE_KEY || status.ANON_KEY || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------- init
if (command === 'init') {
  for (const part of ['app', 'server']) {
    const path = files[part];
    let text = existsSync(path)
      ? readFileSync(path, 'utf8')
      : readFileSync(templates[part], 'utf8');
    const created = !existsSync(path);
    const values = parse(text);
    const filled = [];
    if (part === 'server') {
      if (!values.VAPID_PUBLIC_KEY || !values.VAPID_PRIVATE_KEY) {
        const pair = vapidPair();
        text = setValue(text, 'VAPID_PUBLIC_KEY', pair.publicKey);
        text = setValue(text, 'VAPID_PRIVATE_KEY', pair.privateKey);
        filled.push('a new Web Push key pair');
      }
      if (!production && !values.RAZORPAY_WEBHOOK_SECRET) {
        text = setValue(text, 'RAZORPAY_WEBHOOK_SECRET', randomBytes(24).toString('hex'));
        filled.push('a local webhook secret (signs mock payments)');
      }
      if (!production && !values.VAPID_SUBJECT?.replace(/^mailto:$/, '')) {
        text = setValue(text, 'VAPID_SUBJECT', 'mailto:dev@example.invalid');
        filled.push('a placeholder push contact');
      }
    }
    if (part === 'app' && !production) {
      const key = values.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (!key || key.startsWith('replace-')) {
        const local = localPublishableKey();
        if (local) {
          text = setValue(text, 'EXPO_PUBLIC_SUPABASE_ANON_KEY', local);
          filled.push('the local publishable key');
        }
      }
    }
    if (created || filled.length) writeFileSync(path, text);
    const what = filled.length ? `, filled in ${filled.join(', ')}` : '';
    console.log(`${created ? 'created' : 'kept   '} ${path}${what}`);
  }
  console.log(`\nNext: fill in the empty values, then npm run env:check -- ${mode}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------- check
const results = [];
const report = (level, text) => results.push({ level, text });
const pass = (text) => report('PASS', text);
const warn = (text) => report('WARN', text);
const fail = (text) => report('FAIL', text);

function jwtRole(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
}

// App values: bundled into the APK and the website, so public by nature.
const app = read(files.app);
if (!app) fail(`${files.app} is missing (npm run env:init -- ${mode})`);
else {
  const appEnv = app.APP_ENV ?? '';
  if (appEnv === mode) pass(`${files.app}: APP_ENV=${mode}`);
  else fail(`${files.app}: APP_ENV must be ${mode}`);

  const url = app.EXPO_PUBLIC_SUPABASE_URL ?? '';
  if (production) {
    if (/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) pass(`${files.app}: hosted Supabase URL`);
    else if (url.startsWith('https://') && !/localhost|127\.0\.0\.1|10\.0\.2\.2/.test(url))
      warn(`${files.app}: an https URL that is not *.supabase.co (fine for a custom domain)`);
    else fail(`${files.app}: EXPO_PUBLIC_SUPABASE_URL must be the hosted project (https)`);
  } else if (url) pass(`${files.app}: Supabase URL set`);
  else fail(`${files.app}: EXPO_PUBLIC_SUPABASE_URL is empty`);

  const key = app.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!key || key.startsWith('replace-'))
    fail(`${files.app}: EXPO_PUBLIC_SUPABASE_ANON_KEY is empty`);
  else if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role')
    fail(`${files.app}: that is a SECRET key. Only the publishable (anon) key may be in the app`);
  else if (key.startsWith('sb_publishable_') || jwtRole(key) === 'anon')
    pass(`${files.app}: a publishable key, as it must be`);
  else warn(`${files.app}: the key is not recognisably a publishable key; check it`);

  const extra = Object.keys(app).filter(
    (name) => name !== 'APP_ENV' && !name.startsWith('EXPO_PUBLIC_'),
  );
  if (extra.length)
    warn(`${files.app}: unexpected names (${extra.join(', ')}); the app reads only three`);
  const publicExtra = Object.keys(app).filter(
    (name) =>
      name.startsWith('EXPO_PUBLIC_') &&
      !['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'].includes(name),
  );
  if (publicExtra.length)
    fail(`${files.app}: ${publicExtra.join(', ')} would be bundled into the app; remove them`);
}

// Server secrets.
const server = appOnly ? undefined : read(files.server);
if (server === undefined) {
  // Not needed to build the app.
} else if (!server) {
  (production ? warn : fail)(
    `${files.server} is missing (npm run env:init -- ${mode})${production ? ': needed before the server goes live' : ''}`,
  );
} else {
  const soulEnv = server.SOUL_ENV ?? '';
  if (soulEnv === mode) pass(`${files.server}: SOUL_ENV=${mode}`);
  else fail(`${files.server}: SOUL_ENV must be ${mode}`);

  const provider = server.PAYMENTS_PROVIDER ?? '';
  if (production) {
    if (provider === 'razorpay') pass(`${files.server}: Razorpay payments`);
    else fail(`${files.server}: PAYMENTS_PROVIDER must be razorpay in production`);
  } else if (provider === 'mock' || provider === 'razorpay')
    pass(`${files.server}: payments provider ${provider}`);
  else warn(`${files.server}: PAYMENTS_PROVIDER is empty (checkout is off)`);

  if (provider === 'razorpay') {
    const keyId = server.RAZORPAY_KEY_ID ?? '';
    if (/^rzp_live_\w+$/.test(keyId)) pass(`${files.server}: Razorpay live key id`);
    else if (/^rzp_test_\w+$/.test(keyId))
      warn(`${files.server}: Razorpay TEST key: no real money moves`);
    else fail(`${files.server}: RAZORPAY_KEY_ID must look like rzp_live_... or rzp_test_...`);
    if (server.RAZORPAY_KEY_SECRET) pass(`${files.server}: Razorpay key secret set`);
    else fail(`${files.server}: RAZORPAY_KEY_SECRET is empty`);
  }
  const webhook = server.RAZORPAY_WEBHOOK_SECRET ?? '';
  if (webhook.length >= 12) pass(`${files.server}: webhook secret set`);
  else (provider ? fail : warn)(`${files.server}: RAZORPAY_WEBHOOK_SECRET is empty or too short`);

  const site = server.PAYMENTS_SITE_URL ?? '';
  if (production) {
    if (/^https:\/\/[^/\s]+[^/]$/.test(site)) pass(`${files.server}: checkout returns to ${site}`);
    else
      fail(`${files.server}: PAYMENTS_SITE_URL must be the https site, without a trailing slash`);
  } else if (site) pass(`${files.server}: checkout returns to ${site}`);

  try {
    const publicKey = Buffer.from(server.VAPID_PUBLIC_KEY ?? '', 'base64url');
    const privateKey = Buffer.from(server.VAPID_PRIVATE_KEY ?? '', 'base64url');
    if (publicKey.length !== 65 || publicKey[0] !== 4 || privateKey.length !== 32)
      throw new Error();
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(privateKey);
    if (!ecdh.getPublicKey().equals(publicKey)) throw new Error();
    pass(`${files.server}: Web Push key pair valid and matching`);
  } catch {
    fail(
      `${files.server}: VAPID keys missing or not a matching P-256 pair (npm run env:init -- ${mode})`,
    );
  }
  const subject = server.VAPID_SUBJECT ?? '';
  if (/^mailto:.+@.+/.test(subject) || /^https:\/\//.test(subject))
    pass(`${files.server}: push contact set`);
  else fail(`${files.server}: VAPID_SUBJECT must be mailto:you@... or an https address`);

  const fcm = server.FCM_SERVICE_ACCOUNT ?? '';
  if (!fcm) warn(`${files.server}: no FCM service account: Android gets no notifications (C-16)`);
  else {
    try {
      const account = JSON.parse(fcm);
      if (
        !account.project_id ||
        !account.client_email ||
        !String(account.private_key).includes('PRIVATE KEY')
      )
        throw new Error();
      pass(`${files.server}: FCM service account for project ${account.project_id}`);
      if (existsSync('google-services.json')) {
        const firebase = JSON.parse(readFileSync('google-services.json', 'utf8'));
        if (firebase.project_info?.project_id !== account.project_id)
          fail(
            'google-services.json and FCM_SERVICE_ACCOUNT belong to different Firebase projects',
          );
      }
    } catch {
      fail(`${files.server}: FCM_SERVICE_ACCOUNT is not a service account JSON on one line`);
    }
  }
}

// Android build inputs.
if (existsSync('google-services.json'))
  pass('google-services.json present (Android push builds in)');
else warn('google-services.json missing: the APK builds without Android push (C-16)');

if (production) {
  const signingPath =
    process.env.SOUL_RELEASE_SIGNING || 'D:/soul-dev/signing/soul-release.properties';
  const signing = read(signingPath) ?? {};
  const value = (name) => process.env[`SOUL_RELEASE_${name}`] || signing[name];
  const storeFile = value('STORE_FILE');
  const complete = ['STORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD'].every((name) =>
    Boolean(value(name)),
  );
  if (storeFile && existsSync(storeFile) && complete)
    pass('production signing configured (values not shown)');
  else
    warn(
      'production signing not configured: npm run android:release will stop (BUILD_ANDROID.md "Signing")',
    );
}

for (const { level, text } of results) console.log(`${level}  ${text}`);
const failed = results.filter((result) => result.level === 'FAIL').length;
const warned = results.filter((result) => result.level === 'WARN').length;
console.log(`\n${mode}: ${failed} to fix, ${warned} to note`);
process.exit(failed ? 1 : 0);
