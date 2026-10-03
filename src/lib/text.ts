/**
 * Invisible characters the server refuses in text other people read
 * (supabase/migrations/…_text_safety.sql, DECISIONS D-057): C0 and C1 controls, DEL,
 * bidi embeddings and overrides (U+202A to U+202E) and bidi isolates (U+2066 to U+2069).
 * Pasted text can carry them unseen, so the app removes them before saving rather than
 * failing the save. Tab, line feed and carriage return are left for the callers' own
 * whitespace rules.
 *
 * The patterns are built from code points so this file holds no invisible text itself.
 */
const range = (from: number, to: number) =>
  `${String.fromCharCode(from)}-${String.fromCharCode(to)}`;

const UNSAFE = new RegExp(
  `[${range(0x00, 0x08)}${range(0x0b, 0x0c)}${range(0x0e, 0x1f)}${range(0x7f, 0x9f)}${range(0x202a, 0x202e)}${range(0x2066, 0x2069)}]`,
  'g',
);

/** Unicode line and paragraph separators, which become ordinary line feeds. */
const SEPARATORS = new RegExp(`[${range(0x2028, 0x2029)}]`, 'g');

export function stripInvisible(value: string): string {
  return value.replace(UNSAFE, '').replace(SEPARATORS, '\n');
}
