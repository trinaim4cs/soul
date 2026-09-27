/** Where the Supabase session is persisted (DECISIONS D-006, D-040). */
export type SecureStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
