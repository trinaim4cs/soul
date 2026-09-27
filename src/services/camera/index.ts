import * as ImagePicker from 'expo-image-picker';

import type { CameraService, PickResult } from './types';

export type { CameraService, PickedPhoto, PickResult } from './types';

/** Profile photos are portrait 4:5 (theme `sizes.photoAspect`). */
const OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [4, 5],
  quality: 1,
  exif: false,
};

function toResult(result: ImagePicker.ImagePickerResult): PickResult {
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: 'cancelled' };
  return { status: 'picked', photo: { uri: asset.uri, width: asset.width, height: asset.height } };
}

export const camera: CameraService = {
  async takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
    return toResult(
      await ImagePicker.launchCameraAsync({ ...OPTIONS, cameraType: ImagePicker.CameraType.front }),
    );
  },
  async pickFromLibrary() {
    // The system photo picker needs no storage permission on current Android versions.
    return toResult(await ImagePicker.launchImageLibraryAsync(OPTIONS));
  },
};
