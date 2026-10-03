import { serviceClient } from '../_shared/auth.ts';
import { sendFcm } from '../_shared/fcm.ts';
import { HttpError, handler, json } from '../_shared/http.ts';
import { fcmAccount, vapidKeys } from '../_shared/push.ts';
import { type PushOutcome, sendWebPush } from '../_shared/webpush.ts';

// Push delivery (spec 44, DECISIONS D-054). The database pings this function whenever it
// queues a notification, and once a minute while anything is left. Anyone may ping it: it
// takes no input and only delivers what the server already queued, each at most once.

type Device = {
  id: string;
  platform: 'android' | 'web';
  token: string | null;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
};

type Claimed = {
  id: number;
  kind: string;
  title: string;
  body: string;
  url: string;
  collapse_key: string | null;
  devices: Device[];
};

type Result = PushOutcome | 'off';

const BATCH = 50;
const BUDGET_MS = 20_000;

Deno.serve(
  handler(async (req) => {
    if (req.method !== 'POST') throw new HttpError('invalid_request', 'Use POST.');
    await req.body?.cancel();
    const service = serviceClient();
    const vapid = vapidKeys();
    const fcm = fcmAccount();
    const deadline = Date.now() + BUDGET_MS;
    let delivered = 0;

    async function toDevice(note: Claimed, device: Device): Promise<Result> {
      // Messages and Instant Meet are time-sensitive; the rest can wait for the next wake-up.
      const urgent = note.kind === 'message' || note.kind === 'instant' || note.kind === 'match';
      try {
        if (device.platform === 'android') {
          if (!fcm || !device.token) return 'off';
          const content = {
            title: note.title,
            body: note.body,
            url: note.url,
            collapseKey: note.collapse_key,
            urgent,
          };
          return (await sendFcm(fcm, device.token, content)).outcome;
        }
        if (!vapid || !device.endpoint || !device.p256dh || !device.auth) return 'off';
        const payload = {
          title: note.title,
          body: note.body,
          url: note.url,
          tag: note.collapse_key ?? `soul-${note.id}`,
        };
        const subscription = {
          endpoint: device.endpoint,
          p256dh: device.p256dh,
          auth: device.auth,
        };
        return (
          await sendWebPush(subscription, payload, vapid, { topic: note.collapse_key, urgent })
        ).outcome;
      } catch (error) {
        console.error('push_device_error', error instanceof Error ? error.message : typeof error);
        return 'retry';
      }
    }

    async function deliver(note: Claimed) {
      const results = await Promise.all(
        note.devices.map(async (device) => {
          const result = await toDevice(note, device);
          if (result === 'gone' || result === 'failed') {
            await service.rpc('push_device_failed', {
              p_device: device.id,
              p_gone: result === 'gone',
            });
          }
          return result;
        }),
      );
      const sent = results.includes('sent');
      if (sent) delivered += 1;
      // No device left means there is nobody to deliver to: done, not retried.
      const error = sent
        ? null
        : results.length === 0
          ? 'no_device'
          : results.includes('retry')
            ? 'retry'
            : results.includes('off')
              ? 'channel_off'
              : 'failed';
      await service.rpc('push_mark', {
        p_outbox: note.id,
        p_sent: sent || error === 'no_device',
        p_error: error,
      });
    }

    while (Date.now() < deadline) {
      const { data, error } = await service.rpc('push_claim', { p_limit: BATCH });
      if (error) throw error;
      const batch = (data ?? []) as Claimed[];
      if (batch.length === 0) break;
      await Promise.all(batch.map(deliver));
      if (batch.length < BATCH) break;
    }
    return json({ ok: true, delivered });
  }),
);
