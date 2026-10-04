import { authErrorMessage, classifyAuthError } from './auth-errors';
import { ageOn, formatDobInput, parseDob, toIsoDate } from './date-of-birth';
import { isEmailShape, isObviouslyNotInstitutional, normalizeEmail } from './email';

describe('email', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeEmail('  Test.User.01@SRMIST.EDU.IN ')).toBe('test.user.01@srmist.edu.in');
  });
  it('checks shape only', () => {
    expect(isEmailShape('test.user.01@srmist.edu.in')).toBe(true);
    expect(isEmailShape('test.user.01@')).toBe(false);
    expect(isEmailShape('no-at-sign')).toBe(false);
  });
  it('flags obviously non-institutional domains for early feedback', () => {
    expect(isObviouslyNotInstitutional('test.user.01@gmail.com')).toBe(true);
    expect(isObviouslyNotInstitutional('test.user.01@srmist.edu.in')).toBe(false);
    expect(isObviouslyNotInstitutional('test.user.01')).toBe(false);
  });
});

describe('date of birth', () => {
  it('formats digits progressively', () => {
    expect(formatDobInput('1')).toBe('1');
    expect(formatDobInput('150')).toBe('15 / 0');
    expect(formatDobInput('15062003')).toBe('15 / 06 / 2003');
    expect(formatDobInput('15/06/2003extra9')).toBe('15 / 06 / 2003');
  });
  it('rejects impossible calendar dates', () => {
    expect(parseDob('31 / 02 / 2003')).toBeNull();
    expect(parseDob('29 / 02 / 2003')).toBeNull();
    expect(parseDob('29 / 02 / 2004')).toEqual({ day: 29, month: 2, year: 2004 });
    expect(parseDob('15 / 06 / 20')).toBeNull();
  });
  it('computes age with the birthday counted on the day', () => {
    const dob = { day: 27, month: 9, year: 2008 };
    expect(ageOn(dob, new Date(2026, 8, 26))).toBe(17);
    expect(ageOn(dob, new Date(2026, 8, 27))).toBe(18);
  });
  it('produces an ISO date for the server', () => {
    expect(toIsoDate({ day: 5, month: 3, year: 2004 })).toBe('2004-03-05');
  });
});

describe('auth errors', () => {
  it('recognises the server domain gate', () => {
    expect(
      classifyAuthError({
        message: 'SOUL is only for SRMIST students. Use your SRMIST email.',
        status: 403,
      }),
    ).toBe('not_institutional');
  });
  it('recognises rate limits and codes', () => {
    expect(classifyAuthError({ message: 'email rate limit exceeded', status: 429 })).toBe(
      'rate_limited',
    );
  });
  it('says a wrong code is a wrong code, although the server answers it with a 403', () => {
    // The real Supabase Auth shape for a wrong or expired code.
    const wrongCode = {
      message: 'Token has expired or is invalid',
      status: 403,
      code: 'otp_expired',
    };
    expect(classifyAuthError(wrongCode)).toBe('invalid_code');
    expect(authErrorMessage(wrongCode)).toContain("didn't work");
  });
  it('tells a refused address apart from a non-SRMIST one', () => {
    expect(classifyAuthError({ message: "This email can't be used for SOUL.", status: 403 })).toBe(
      'email_unavailable',
    );
  });
  it('never exposes raw messages', () => {
    expect(authErrorMessage({ message: 'relation "x" does not exist' })).toBe(
      'Something went wrong. Try again.',
    );
  });
});
