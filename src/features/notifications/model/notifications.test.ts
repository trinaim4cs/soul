import {
  deviceCopy,
  notificationRoute,
  settingsSchema,
} from '@/features/notifications/model/notifications';

const id = '00000000-0000-4000-8000-000000000001';

describe('notification links', () => {
  it('opens only pages inside SOUL that a notification is about', () => {
    expect(notificationRoute(`/chat/${id}`)).toBe(`/chat/${id}`);
    expect(notificationRoute(`/match/${id}`)).toBe(`/match/${id}`);
    expect(notificationRoute(`/instant/session/${id}`)).toBe(`/instant/session/${id}`);
    expect(notificationRoute(`/instant/chat/${id}`)).toBe(`/instant/chat/${id}`);
    expect(notificationRoute('/settings/purchases')).toBe('/settings/purchases');
  });

  it('ignores anything else', () => {
    expect(notificationRoute('https://example.invalid/')).toBeNull();
    expect(notificationRoute('//example.invalid/chat')).toBeNull();
    expect(notificationRoute('/settings/delete')).toBeNull();
    expect(notificationRoute(`/chat/${id}?next=/settings/delete`)).toBeNull();
    expect(notificationRoute(undefined)).toBeNull();
    expect(notificationRoute(42)).toBeNull();
  });
});

describe('settings', () => {
  it('reads the server payload', () => {
    expect(
      settingsSchema.parse({
        ok: true,
        matches: true,
        messages: false,
        instant: true,
        payments: true,
        devices: 2,
      }).messages,
    ).toBe(false);
  });

  it('tells iPhone browser users how to get notifications', () => {
    expect(deviceCopy('unavailable', null, true).title).toBe('Add SOUL to your Home Screen');
    expect(deviceCopy('unavailable', null, false).title).toBe('Not available here');
  });

  it('is honest when this build cannot receive them', () => {
    expect(deviceCopy('granted', false, false).title).toBe("Notifications aren't ready yet");
    expect(deviceCopy('granted', true, false).title).toBe('Notifications are on');
  });
});
