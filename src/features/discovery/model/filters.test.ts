import { AGE_MAX, AGE_MIN, clampRange } from './filters';

describe('age range', () => {
  it('keeps values inside the allowed range', () => {
    expect(clampRange(10, 90, 'min')).toEqual({ minAge: AGE_MIN, maxAge: AGE_MAX });
  });

  it('moves the other end instead of crossing', () => {
    expect(clampRange(31, 30, 'min')).toEqual({ minAge: 31, maxAge: 31 });
    expect(clampRange(25, 24, 'max')).toEqual({ minAge: 24, maxAge: 24 });
  });

  it('leaves a valid range untouched', () => {
    expect(clampRange(20, 28, 'max')).toEqual({ minAge: 20, maxAge: 28 });
  });
});
