/**
 * Photo capture contract (profile photos, Phase 5). One implementation (`index.ts`) serves
 * Android and the PWA: expo-image-picker opens the system camera or photo picker natively,
 * and a file input with `capture` on the web. Every result goes through the same processing
 * and server upload pipeline.
 */
export type PickedPhoto = { uri: string; width: number; height: number };

export type PickResult =
  { status: 'picked'; photo: PickedPhoto } | { status: 'cancelled' } | { status: 'denied' };

export type CameraService = {
  /** Front camera by default: the primary photo should be a fresh photo of you (spec 14). */
  takePhoto(): Promise<PickResult>;
  pickFromLibrary(): Promise<PickResult>;
};
