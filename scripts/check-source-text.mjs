// Fails when a tracked text file holds invisible control or bidi characters (Phase 18,
// SECURITY_AUDIT.md, "Trojan Source"): such a character can make code or SQL read one way in
// review and run another. Tests and rules that need these characters build them from code
// points (String.fromCharCode, chr(), \x escapes) instead of holding them.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const invisible = (code) =>
  code <= 0x08 ||
  code === 0x0b ||
  code === 0x0c ||
  (code >= 0x0e && code <= 0x1f) ||
  (code >= 0x7f && code <= 0x9f) ||
  code === 0x061c ||
  (code >= 0x200b && code <= 0x200f) ||
  (code >= 0x202a && code <= 0x202e) ||
  (code >= 0x2066 && code <= 0x2069) ||
  code === 0x2028 ||
  code === 0x2029 ||
  code === 0xfeff;

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter((file) => /\.(ts|tsx|js|mjs|cjs|sql|md|json|toml|ya?ml|sh|html|css|txt)$/.test(file));

const found = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // deleted in the working tree
  }
  text.split('\n').forEach((line, index) => {
    const codes = [...line].map((char) => char.codePointAt(0)).filter(invisible);
    if (codes.length) {
      const names = codes.map((code) => `U+${code.toString(16).toUpperCase().padStart(4, '0')}`);
      found.push(`${file}:${index + 1} ${names.join(' ')}`);
    }
  });
}

for (const line of found) {
  console.log(line);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=invisible character::${line}`);
}
console.log(`${files.length} files checked, ${found.length} lines with invisible characters`);
process.exit(found.length ? 1 : 0);
