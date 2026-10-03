import { cleanDraft } from '@/features/chat/model/chat';
import { cleanAbout, cleanText } from '@/features/profile/model/profile';

import { stripInvisible } from './text';

// Built from code points so this file holds no invisible text itself.
const char = (code: number) => String.fromCharCode(code);
const RLO = char(0x202e); // right-to-left override
const LRO = char(0x202d); // left-to-right override
const ISOLATE = char(0x2066); // left-to-right isolate
const POP_ISOLATE = char(0x2069);
const RLM = char(0x200f); // right-to-left mark (allowed)
const ZWJ = char(0x200d); // zero-width joiner (allowed)
const LINE_SEPARATOR = char(0x2028);
const PARAGRAPH_SEPARATOR = char(0x2029);

describe('stripInvisible', () => {
  it('removes bidi overrides, isolates and control characters', () => {
    expect(stripInvisible(`Test User 01${RLO}10 resU`)).toBe('Test User 0110 resU');
    expect(
      stripInvisible(`a${ISOLATE}b${POP_ISOLATE}c${char(7)}d${char(0x85)}e${char(0x7f)}f${LRO}`),
    ).toBe('abcdef');
  });

  it('keeps line breaks, tabs, directional marks, emoji joiners and every script', () => {
    const text = `Profile 01\n\tनमस्ते தமிழ் عربي ${RLM} 👩${ZWJ}💻`;
    expect(stripInvisible(text)).toBe(text);
  });

  it('turns Unicode line separators into line feeds', () => {
    expect(stripInvisible(`one${LINE_SEPARATOR}two${PARAGRAPH_SEPARATOR}three`)).toBe(
      'one\ntwo\nthree',
    );
  });
});

describe('text the server would refuse never leaves the app', () => {
  it('cleans names, hooks, About me and messages', () => {
    expect(cleanText(`  User${RLO} A ${char(0)}`)).toBe('User A');
    expect(cleanAbout(`Line one\r\nLine two${ISOLATE}`)).toBe('Line one\nLine two');
    expect(cleanDraft(`see you${RLO} at 5`)).toBe('see you at 5');
    expect(cleanDraft(RLO)).toBeNull();
  });
});
