/**
 * Device-integrity contract (DECISIONS D-023). Native: Play Integrity when configured plus the
 * mock-location flag. Web: always `unavailable`. Signals are sent to the server as hints for
 * review; the client never decides anything from them.
 */
export type IntegritySignal = { kind: 'play-integrity' | 'mock-location'; value: string };

export type DeviceIntegrityService = {
  collect(): Promise<IntegritySignal[] | 'unavailable'>;
};
