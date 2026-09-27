import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DRAFT_LABEL, LEGAL_DOCUMENT_ORDER, LEGAL_DOCUMENTS, TERMS_VERSION } from './documents';

const MIGRATIONS = join(__dirname, '../../../../supabase/migrations');

/** The last terms version any migration writes to app_config.current_terms_version. */
function serverTermsVersion(): string | undefined {
  let version: string | undefined;
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    if (!sql.includes('current_terms_version')) continue;
    const matches = [...sql.matchAll(/"version":\s*"([^"]+)"/g)];
    const last = matches.at(-1);
    if (last) version = last[1];
  }
  return version;
}

describe('legal documents', () => {
  it('uses the same terms version as the server migrations', () => {
    expect(serverTermsVersion()).toBe(TERMS_VERSION);
  });

  it('lists every document once, each with content', () => {
    expect(new Set(LEGAL_DOCUMENT_ORDER).size).toBe(Object.keys(LEGAL_DOCUMENTS).length);
    for (const id of LEGAL_DOCUMENT_ORDER) {
      expect(LEGAL_DOCUMENTS[id].id).toBe(id);
      expect(LEGAL_DOCUMENTS[id].sections.length).toBeGreaterThan(0);
    }
  });

  it('carries the owner-required draft label', () => {
    expect(DRAFT_LABEL).toBe('DRAFT — REQUIRES FINAL HUMAN/LEGAL REVIEW');
  });

  it('never claims identity or face verification', () => {
    const text = JSON.stringify(LEGAL_DOCUMENTS).toLowerCase();
    expect(text).not.toMatch(/we verify your identity|face match|selfie verification/);
  });
});
