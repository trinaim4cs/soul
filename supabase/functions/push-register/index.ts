import { z } from 'npm:zod@4';

import { requireUser, serviceClient } from '../_shared/auth.ts';
import { HttpError, handler, json } from '../_shared/http.ts';
import { fcmAccount, vapidKeys } from '../_shared/push.ts';
import { parseBody } from '../_shared/validate.ts';
import { base64UrlDecode, isPushEndpoint } from '../_shared/webpush.ts';

// Push device registration (spec 44, DECISIONS D-054).
//   GET:  which channels are on, and the public VAPID key a browser subscribes with.
//   POST: register or remove this device for the signed-in person. A web subscription must
//         point at a known push service, so the sender never posts anywhere else.

function keyOfLength(length: number, uncompressedPoint = false) {
  return z
    .string()
    .max(200)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/)
    .refine((value) => {
      try {
        const bytes = base64UrlDecode(value.replace(/=+$/, ''));
        return bytes.length === length && (!uncompressedPoint || bytes[0] === 4);
      } catch {
        return false;
      }
    });
}

const endpoint = z.string().max(2048).refine(isPushEndpoint);

const body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('register'),
    device: z.union([
      z.object({ platform: z.literal('android'), token: z.string().min(1).max(4096) }),
      z.object({
        platform: z.literal('web'),
        endpoint,
        keys: z.object({ p256dh: keyOfLength(65, true), auth: keyOfLength(16) }),
      }),
    ]),
  }),
  z.object({
    action: z.literal('unregister'),
    token: z.string().min(1).max(4096).optional(),
    endpoint: z.string().max(2048).optional(),
  }),
]);

Deno.serve(
  handler(async (req) => {
    if (req.method === 'GET') {
      const vapid = vapidKeys();
      return json({
        ok: true,
        web: vapid ? { publicKey: vapid.publicKey } : null,
        android: fcmAccount() !== null,
      });
    }
    if (req.method !== 'POST') throw new HttpError('invalid_request', 'Use GET or POST.');
    const { user } = await requireUser(req);
    const input = await parseBody(req, body);
    const service = serviceClient();

    if (input.action === 'unregister') {
      const { data, error } = await service.rpc('push_unregister_device', {
        p_user: user.id,
        p_token: input.token ?? null,
        p_endpoint: input.endpoint ?? null,
      });
      if (error) throw error;
      return json(data);
    }

    const device = input.device;
    const { data, error } = await service.rpc('push_register_device', {
      p_user: user.id,
      p_platform: device.platform,
      p_token: device.platform === 'android' ? device.token : null,
      p_endpoint: device.platform === 'web' ? device.endpoint : null,
      p_p256dh: device.platform === 'web' ? device.keys.p256dh : null,
      p_auth: device.platform === 'web' ? device.keys.auth : null,
    });
    if (error) throw error;
    if (!data?.ok)
      throw new HttpError('forbidden', 'Notifications are not available for this account.');
    return json({ ok: true });
  }),
);
