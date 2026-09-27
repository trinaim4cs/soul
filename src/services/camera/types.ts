/**
 * Photo capture contract (profile photos, Phase 5). `index.ts`: native picker or camera.
 * `index.web.ts`: `<input type="file" accept="image/*" capture>`. Both return a local file
 * that goes through the same server upload and moderation pipeline.
 */
export type PickedPhoto = { uri: string; width: number; height: number; mimeType: string };

export type CameraService = {
  takePhoto(): Promise<PickedPhoto | null>;
  pickFromLibrary(): Promise<PickedPhoto | null>;
};
