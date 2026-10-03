// Cross-account attack run against the local stack (Phase 18, SECURITY_AUDIT.md).
//
// User A, signed in like any student, goes after User B's private data with every route the
// app's own credentials allow: direct table reads, the private schema, RPCs with B's ids,
// Storage, Realtime topics and the Edge Functions. Spec 72 asks to prove that A cannot reach
// B's raw coordinates, identity documents, billing, reports or verification details.
//
// Usage: npm run db:start, then npm run security:attack (also part of npm run test:all).
import { randomBytes, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';

import { createClient } from '@supabase/supabase-js';

const status = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
const url = status.API_URL;
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok && process.env.GITHUB_ACTIONS) {
    const text = `${name}${detail ? ` (${detail})` : ''}`.replace(/\r?\n/g, ' ').slice(0, 900);
    console.log(`::error title=security:attack::${text}`);
  }
};

const created = [];

// A crash (not a failed check) is reported the same way in CI, and the test people go.
for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, async (error) => {
    const text = String(error?.stack ?? error)
      .replace(/\r?\n/g, ' ')
      .slice(0, 900);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=security:attack crashed::${text}`);
    console.error(error);
    for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
    process.exit(1);
  });
}

async function person(label, gender, showMe) {
  const email = `test.user.${label}.${randomBytes(4).toString('hex')}@srmist.edu.in`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  created.push(id);
  const terms = await admin
    .from('app_config')
    .select('value')
    .eq('key', 'current_terms_version')
    .single();
  await admin
    .from('account_private')
    .update({
      terms_version: terms.data.value.version,
      terms_accepted_at: new Date().toISOString(),
      date_of_birth: '2003-05-17',
      profile_completed_at: new Date().toISOString(),
    })
    .eq('id', id);
  await admin
    .from('profiles')
    .update({ display_name: 'Test User', hook: 'Hook', gender })
    .eq('id', id);
  await admin.from('preferences').update({ show_me: showMe }).eq('user_id', id);
  // Visible people have an approved photo (the row is enough; no file is needed here).
  const photo = randomUUID();
  await admin.from('profile_photos').insert({
    id: photo,
    user_id: id,
    storage_path: `${id}/${photo}.jpg`,
    blurred_path: `${id}/${photo}.jpg`,
    position: 0,
    status: 'approved',
    source: 'camera',
    width: 1080,
    height: 1350,
  });
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(url, status.ANON_KEY, { auth: { persistSession: false } });
  const signedIn = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties.hashed_token,
  });
  if (signedIn.error) throw signedIn.error;
  return { id, email, client, token: signedIn.data.session.access_token };
}

const attacker = await person('attacker', 'man', ['woman']);
const victim = await person('victim', 'woman', ['man']);
const partner = await person('partner', 'man', ['woman']);

// The victim's private life: a match and chat with the partner, a payment, a report, a push
// device, a live Instant Meet position and a confirmed date.
const [low, high] = [victim.id, partner.id].sort();
const match = await admin
  .from('matches')
  .insert({ user_a: low, user_b: high })
  .select('id')
  .single();
const conversation = await admin
  .from('conversations')
  .select('id')
  .eq('match_id', match.data.id)
  .single();
const conversationId = conversation.data.id;
await victim.client.rpc('send_message', {
  p_conversation: conversationId,
  p_body: 'private victim message',
  p_client_id: randomUUID(),
});
const checkout = await victim.client.functions.invoke('payments-checkout', {
  body: { plan: 'weekly', platform: 'web' },
});
const orderId = checkout.data?.order?.id ?? checkout.data?.order_id ?? null;
await victim.client.rpc('report_user', {
  p_target: partner.id,
  p_category: 'spam',
  p_details: 'victim report',
  p_context: 'profile',
  p_block: false,
});
const endpoint = `https://fcm.googleapis.com/fcm/send/attack-${randomBytes(6).toString('hex')}`;
const p256dh = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 5)]).toString('base64url');
await victim.client.functions.invoke('push-register', {
  body: {
    action: 'register',
    device: {
      platform: 'web',
      endpoint,
      keys: { p256dh, auth: Buffer.alloc(16, 6).toString('base64url') },
    },
  },
});
await admin.rpc('activate_plan', {
  p_user: victim.id,
  p_plan: 'monthly',
  p_key: `attack-${randomUUID()}`,
});
await victim.client.rpc('instant_start', { p_minutes: 30 });
const victimSpot = { p_latitude: 12.8231234, p_longitude: 80.0451234, p_accuracy: 8 };
await victim.client.rpc('instant_update_location', victimSpot);
await admin.from('date_rounds').insert({
  user_a: low,
  user_b: high,
  source: 'match',
  status: 'confirmed',
  closes_at: new Date(Date.now() + 6 * 86400000).toISOString(),
  a_answer: true,
  b_answer: true,
  a_answered_at: new Date().toISOString(),
  b_answered_at: new Date().toISOString(),
  confirmed_at: new Date().toISOString(),
  closed_at: new Date().toISOString(),
});
// Raw coordinates: the victim is a live candidate 20 m from the attacker, the closest the
// attacker can get, and still no output carries a position.
await admin.rpc('activate_plan', {
  p_user: attacker.id,
  p_plan: 'monthly',
  p_key: `attack-${randomUUID()}`,
});
await attacker.client.rpc('instant_start', { p_minutes: 30 });
await attacker.client.rpc('instant_update_location', {
  p_latitude: 12.8232,
  p_longitude: 80.0452,
  p_accuracy: 8,
});
const candidates = await attacker.client.rpc('instant_candidates');
const instantState = await attacker.client.rpc('instant_state');
const coordinate = /12\.823|80\.045|"(latitude|longitude|location|lat|lng|accuracy_m)"/;
const seesVictim = (candidates.data?.candidates ?? []).some(
  (candidate) => candidate.id === victim.id,
);
const positionCheck = {
  ok:
    seesVictim &&
    !coordinate.test(JSON.stringify(candidates.data ?? null)) &&
    !coordinate.test(JSON.stringify(instantState.data ?? null)),
  detail: JSON.stringify({ seesVictim, candidates: candidates.data }).slice(0, 240),
};
await attacker.client.rpc('instant_stop');
await victim.client.rpc('instant_stop');

// Hidden from discovery, so nothing about the victim is meant to reach the attacker.
await admin.from('profiles').update({ privacy_mode: 'private' }).eq('id', victim.id);

const a = attacker.client;
const leaked = (value, needles) => {
  const text = JSON.stringify(value ?? null);
  return needles.some((needle) => text.includes(needle));
};
const victimNeedles = [
  victim.id,
  victim.email,
  'private victim message',
  'victim report',
  endpoint,
];

// ---------------------------------------------------------------- 1. every table, directly
const tables = [
  'account_private',
  'profiles',
  'profile_photos',
  'preferences',
  'likes',
  'passes',
  'blocks',
  'matches',
  'conversations',
  'conversation_members',
  'messages',
  'payment_orders',
  'payment_events',
  'payment_refunds',
  'subscriptions',
  'swipe_credit_ledger',
  'reports',
  'appeals',
  'moderation_actions',
  'audit_events',
  'push_devices',
  'notification_outbox',
  'notification_settings',
  'instant_sessions',
  'date_rounds',
  'date_review_flags',
  'admin_roles',
];
const tableLeaks = [];
for (const table of tables) {
  const everything = await a.from(table).select('*').limit(1000);
  if (!everything.error && leaked(everything.data, victimNeedles)) tableLeaks.push(table);
}
check(
  'no table read shows anything of the victim (account, verification, billing, reports, devices, chat)',
  tableLeaks.length === 0,
  tableLeaks.join(', '),
);
const verification = await a.from('account_private').select('*').eq('id', victim.id);
check(
  "the victim's verification details (email confirmation, birth date) are unreadable",
  (verification.data ?? []).length === 0,
  JSON.stringify(verification.data),
);

// ---------------------------------------------------------------- 2. schemas that are not exposed
const presence = await fetch(`${url}/rest/v1/instant_presence?select=*`, {
  headers: {
    apikey: status.ANON_KEY,
    authorization: `Bearer ${attacker.token}`,
    'accept-profile': 'private',
  },
});
const authUsers = await fetch(`${url}/rest/v1/users?select=*`, {
  headers: {
    apikey: status.ANON_KEY,
    authorization: `Bearer ${attacker.token}`,
    'accept-profile': 'auth',
  },
});
const graphql = await fetch(`${url}/graphql/v1`, {
  method: 'POST',
  headers: {
    apikey: status.ANON_KEY,
    authorization: `Bearer ${attacker.token}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ query: '{ __schema { types { name } } }' }),
});
const graphqlText = await graphql.text();
check(
  'raw positions, auth users and GraphQL are out of reach (private and auth schemas not exposed)',
  !presence.ok &&
    !authUsers.ok &&
    !/account_private|instant_presence|payment_orders/.test(graphqlText),
  `${presence.status} ${authUsers.status} ${graphql.status}`,
);

// ---------------------------------------------------------------- 3. RPCs with the victim's ids
const rpcs = {
  get_match: await a.rpc('get_match', { p_match: match.data.id }),
  get_messages: await a.rpc('get_messages', {
    p_conversation: conversationId,
    p_before: null,
    p_limit: 50,
  }),
  send_message: await a.rpc('send_message', {
    p_conversation: conversationId,
    p_body: 'intruding',
    p_client_id: randomUUID(),
  }),
  mark_conversation_read: await a.rpc('mark_conversation_read', {
    p_conversation: conversationId,
    p_message: 999999,
  }),
  unmatch: await a.rpc('unmatch', { p_match: match.data.id }),
  get_payment: orderId ? await a.rpc('get_payment', { p_order: orderId }) : { data: null },
  date_state: await a.rpc('date_state', { p_other: victim.id }),
  get_profile_card: await a.rpc('get_profile_card', { p_target: victim.id }),
  instant_accept: await a.rpc('instant_accept', { p_candidate: victim.id }),
};
const rpcLeaks = Object.entries(rpcs)
  .filter(
    ([, result]) =>
      !result.error && leaked(result.data, victimNeedles.concat(['"ok":true,"messages"'])),
  )
  .map(([name]) => name);
const stillActive = await admin.from('matches').select('active').eq('id', match.data.id).single();
const intruded = await admin.from('messages').select('id').eq('body', 'intruding');
check(
  "RPCs given the victim's match, chat, order or id refuse or reveal nothing",
  rpcLeaks.length === 0 && stillActive.data?.active === true && (intruded.data ?? []).length === 0,
  rpcLeaks.join(', '),
);
check(
  'the private (hidden) victim has no profile card for the attacker',
  rpcs.get_profile_card.data?.ok !== true,
);

// ---------------------------------------------------------------- 4. raw coordinates
check(
  "the victim's raw coordinates appear in no Instant output, even as a candidate 20 m away",
  positionCheck.ok,
  positionCheck.detail,
);

// ---------------------------------------------------------------- 5. Storage
const listed = await Promise.all(
  [
    'profile-photos',
    'profile-photos-blurred',
    'photo-uploads',
    'report-evidence',
    'chat-media',
  ].map((bucket) => a.storage.from(bucket).list(victim.id)),
);
const uploaded = await a.storage
  .from('photo-uploads')
  .upload(`${victim.id}/${randomUUID()}.jpg`, Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
    contentType: 'image/jpeg',
  });
check(
  "the attacker can neither list nor write into the victim's storage folders",
  listed.every((result) => (result.data ?? []).length === 0) && Boolean(uploaded.error),
  JSON.stringify({ upload: uploaded.error?.message }),
);

// ---------------------------------------------------------------- 6. Edge Functions
const sync = orderId
  ? await a.functions.invoke('payments-sync', { body: { order_id: orderId } })
  : { data: null };
const unregister = await a.functions.invoke('push-register', {
  body: { action: 'unregister', endpoint },
});
const victimDevice = await admin.from('push_devices').select('id').eq('web_endpoint', endpoint);
check(
  "the attacker cannot touch the victim's order or push device through the Edge Functions",
  !leaked(sync.data, [orderId ?? 'none', victim.id]) &&
    unregister.data?.removed === 0 &&
    (victimDevice.data ?? []).length === 1,
  JSON.stringify({ sync: sync.data, removed: unregister.data?.removed }),
);

// ---------------------------------------------------------------- 7. Realtime topics
async function joins(who, topic) {
  const channel = who.client.channel(topic, { config: { private: true } });
  await who.client.realtime.setAuth(who.token);
  const outcome = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), 4000);
    channel.subscribe((state) => {
      if (state === 'SUBSCRIBED' || state === 'CHANNEL_ERROR') {
        clearTimeout(timer);
        resolve(state);
      }
    });
  });
  await who.client.removeChannel(channel);
  return outcome;
}
// Control: the victim can join their own topic, so a refusal below is a refusal, not an outage.
const ownTopic = await joins(victim, `user:${victim.id}`);
const userTopic = await joins(attacker, `user:${victim.id}`);
const chatTopic = await joins(attacker, `chat:${conversationId}`);
check(
  "the attacker cannot join the victim's account or chat topics (the victim can)",
  ownTopic === 'SUBSCRIBED' && userTopic !== 'SUBSCRIBED' && chatTopic !== 'SUBSCRIBED',
  `own ${ownTopic}, attacker ${userTopic} ${chatTopic}`,
);

// ---------------------------------------------------------------- 8. self-service limits
const selfGrant = await a
  .from('account_private')
  .update({ institutional_email_verified_at: null })
  .eq('id', attacker.id);
const roleGrant = await a.from('admin_roles').insert({ user_id: attacker.id, role: 'admin' });
const planGrant = await a.rpc('activate_plan', {
  p_user: attacker.id,
  p_plan: 'half_year',
  p_key: 'x',
});
const nameSwap = await a
  .from('profiles')
  .update({ display_name: 'Test User' })
  .eq('id', victim.id)
  .select();
check(
  'the attacker cannot change verification, grant a role or a plan, or edit the victim',
  Boolean(selfGrant.error) &&
    Boolean(roleGrant.error) &&
    Boolean(planGrant.error) &&
    (nameSwap.data ?? []).length === 0,
  JSON.stringify({
    verified: selfGrant.error?.code,
    role: roleGrant.error?.code,
    plan: planGrant.error?.code,
  }),
);

// ---------------------------------------------------------------- 9. text that reorders itself
// A modified client skips the app's own cleaning; the database still refuses overrides.
const spoofName = await a
  .from('profiles')
  .update({ display_name: `Test User 01${String.fromCharCode(0x202e)}10` })
  .eq('id', attacker.id);
const spoofReport = await a.rpc('report_user', {
  p_target: victim.id,
  p_category: 'spam',
  p_details: `see${String.fromCharCode(0x2066)} attached`,
  p_context: 'profile',
  p_block: false,
});
check(
  'the attacker cannot store bidi overrides or isolates in a name or a report',
  spoofName.error?.code === '23514' && spoofReport.error?.code === '23514',
  JSON.stringify({ name: spoofName.error?.code, report: spoofReport.error?.code }),
);

// ---------------------------------------------------------------- clean up
for (const client of [attacker.client, victim.client, partner.client])
  await client.removeAllChannels();
await admin.from('push_devices').delete().eq('web_endpoint', endpoint);
for (const id of created) await admin.auth.admin.deleteUser(id);

const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} attack checks held`);
process.exit(failed ? 1 : 0);
