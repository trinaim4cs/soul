/**
 * Which route group the user may see. Only the server can declare an account `eligible`
 * (SECURITY_MODEL section 4); the client never promotes itself.
 */
export type AccountStatus =
  | 'loading'
  | 'signed-out'
  | 'onboarding'
  | 'eligible'
  /** Suspended, banned or pending deletion (the restricted screen, D-053). */
  | 'restricted'
  /** The server status could not be fetched (offline or error): show a retry state. */
  | 'unavailable';

export type ServerStatusSnapshot =
  | { kind: 'pending' }
  | { kind: 'error' }
  | { kind: 'ready'; accountState: string; eligibility: 'incomplete' | 'eligible' };

type Inputs = {
  sessionLoaded: boolean;
  hasSession: boolean;
  server: ServerStatusSnapshot;
};

export function deriveAccountStatus({ sessionLoaded, hasSession, server }: Inputs): AccountStatus {
  if (!sessionLoaded) return 'loading';
  if (!hasSession) return 'signed-out';
  if (server.kind === 'pending') return 'loading';
  if (server.kind === 'error') return 'unavailable';
  if (server.accountState !== 'active') return 'restricted';
  return server.eligibility === 'eligible' ? 'eligible' : 'onboarding';
}
