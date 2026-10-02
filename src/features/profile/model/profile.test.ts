import {
  cleanAbout,
  cleanText,
  missingFields,
  myProfileSchema,
  toggleGender,
  zodiacLabel,
  type MyProfile,
} from './profile';

const base: MyProfile = {
  id: '00000000-0000-4000-8000-0000000000e1',
  display_name: 'User A',
  hook: 'Late chai, early runs',
  about: null,
  gender: 'woman',
  privacy_mode: 'normal',
  reveal_on_match: true,
  zodiac_visible: false,
  zodiac: 'gemini',
  age: 22,
  verified: true,
  complete: false,
  show_me: ['man'],
  photos: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      storage_path: 'a/1.jpg',
      blurred_path: 'a/1.jpg',
      position: 0,
      status: 'approved',
      width: 1080,
      height: 1350,
    },
  ],
};

describe('profile model', () => {
  it('parses the server read model', () => {
    expect(myProfileSchema.parse(base)).toEqual(base);
  });

  it('matches the server completeness rule', () => {
    expect(missingFields(base)).toEqual([]);
    expect(
      missingFields({
        ...base,
        photos: [],
        display_name: ' ',
        gender: null,
        show_me: [],
        hook: null,
      }),
    ).toEqual(['photo', 'name', 'gender', 'show_me', 'hook']);
  });

  it('does not count rejected photos', () => {
    const rejected = { ...base.photos[0]!, status: 'rejected' as const };
    expect(missingFields({ ...base, photos: [rejected] })).toEqual(['photo']);
  });

  it('cleans text input', () => {
    expect(cleanText('  Late   chai  ')).toBe('Late chai');
    expect(cleanAbout('Line one\n\n\n\nLine  two  ')).toBe('Line one\n\nLine two');
  });

  it('toggles "show me" in a stable order', () => {
    expect(toggleGender(['non_binary'], 'woman')).toEqual(['woman', 'non_binary']);
    expect(toggleGender(['woman', 'man'], 'woman')).toEqual(['man']);
  });

  it('labels zodiac signs', () => {
    expect(zodiacLabel('sagittarius')).toBe('Sagittarius');
  });
});
