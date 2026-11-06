import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import type { UploadFile } from '@/api';

/** Let the user take a photo or pick one. Returns null if cancelled/denied. */
export async function pickImage(
  opts: { source?: 'camera' | 'library'; square?: boolean } = {},
): Promise<UploadFile | null> {
  const source = opts.source ?? 'library';
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      'Permission needed',
      `Allow ${source === 'camera' ? 'camera' : 'photo library'} access in Settings to continue.`,
    );
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    allowsEditing: !!opts.square,
    aspect: opts.square ? [1, 1] : undefined,
  };
  const res =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? null };
}

/** Ask camera vs. library, then pick. */
export function chooseImage(title: string, square = false): Promise<UploadFile | null> {
  return new Promise((resolve) => {
    Alert.alert(title, undefined, [
      { text: 'Take photo', onPress: () => pickImage({ source: 'camera', square }).then(resolve) },
      { text: 'Choose from library', onPress: () => pickImage({ source: 'library', square }).then(resolve) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}
