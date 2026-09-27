import { deriveAccountStatus, type ServerStatusSnapshot } from './account-status';

const ready = (
  eligibility: 'incomplete' | 'eligible',
  accountState = 'active',
): ServerStatusSnapshot => ({ kind: 'ready', accountState, eligibility });

describe('deriveAccountStatus', () => {
  it('waits while the stored session is loading', () => {
    expect(
      deriveAccountStatus({ sessionLoaded: false, hasSession: false, server: { kind: 'pending' } }),
    ).toBe('loading');
  });

  it('sends users without a session to auth', () => {
    expect(
      deriveAccountStatus({ sessionLoaded: true, hasSession: false, server: { kind: 'pending' } }),
    ).toBe('signed-out');
  });

  it('keeps the splash up while the server status is pending', () => {
    expect(
      deriveAccountStatus({ sessionLoaded: true, hasSession: true, server: { kind: 'pending' } }),
    ).toBe('loading');
  });

  it('shows a retry state when the server status cannot be fetched', () => {
    expect(
      deriveAccountStatus({ sessionLoaded: true, hasSession: true, server: { kind: 'error' } }),
    ).toBe('unavailable');
  });

  it('keeps signed-in users in onboarding until the server says eligible', () => {
    expect(
      deriveAccountStatus({ sessionLoaded: true, hasSession: true, server: ready('incomplete') }),
    ).toBe('onboarding');
  });

  it('opens the app only on server-declared eligibility', () => {
    expect(
      deriveAccountStatus({ sessionLoaded: true, hasSession: true, server: ready('eligible') }),
    ).toBe('eligible');
  });

  it('restricts suspended or banned accounts even if otherwise eligible', () => {
    expect(
      deriveAccountStatus({
        sessionLoaded: true,
        hasSession: true,
        server: ready('eligible', 'suspended'),
      }),
    ).toBe('restricted');
  });

  it('never lets a signed-out user reach the app', () => {
    expect(
      deriveAccountStatus({ sessionLoaded: true, hasSession: false, server: ready('eligible') }),
    ).toBe('signed-out');
  });
});
