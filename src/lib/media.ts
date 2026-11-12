import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';

import type { UploadFile } from '@/api';
import { alert } from '@/components/Dialog';
import type { IconName } from '@/components/Icon';

/** A themed yes/no dialog; resolves true when the user confirms. */
export function confirmDialog(
  title: string,
  message: string,
  confirmText: string,
  opts: { icon?: IconName; cancelText?: string } = {},
): Promise<boolean> {
  return new Promise((resolve) =>
    alert(
      title,
      message,
      [
        { text: opts.cancelText ?? 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, onPress: () => resolve(true) },
      ],
      { icon: opts.icon },
    ),
  );
}

/** Explains a permission is blocked and offers to open the app's system settings. */
export function showPermissionBlocked(what: string, why: string, icon: IconName) {
  alert(
    `${what} access is off`,
    `${why} Turn on ${what.toLowerCase()} access for Evenly in your phone's settings.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open settings', onPress: () => void Linking.openSettings() },
    ],
    { icon },
  );
}

/**
 * Camera permission with an in-app explanation first: the system prompt (which
 * the app can't style) only appears after the user chooses to continue.
 */
async function ensureCamera(): Promise<boolean> {
  let perm = await ImagePicker.getCameraPermissionsAsync();
  if (perm.granted) return true;
  if (perm.canAskAgain) {
    const ok = await confirmDialog(
      'Use your camera?',
      'Evenly uses the camera to photograph receipts and set your profile photo. Your phone will ask you to confirm.',
      'Continue',
      { icon: 'camera' },
    );
    if (!ok) return false;
    perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.granted) return true;
    if (perm.canAskAgain) return false; // declined for now; ask again next time
  }
  showPermissionBlocked('Camera', 'Evenly needs the camera to take receipt and profile photos.', 'camera');
  return false;
}

/** Let the user take a photo or pick one. Returns null if cancelled/denied. */
export async function pickImage(
  opts: { source?: 'camera' | 'library'; square?: boolean } = {},
): Promise<UploadFile | null> {
  const source = opts.source ?? 'library';
  // The library opens the system photo picker, which needs no permission.
  if (source === 'camera' && !(await ensureCamera())) return null;
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
    alert(title, undefined, [
      { text: 'Take photo', onPress: () => void pickImage({ source: 'camera', square }).then(resolve) },
      { text: 'Choose from library', onPress: () => void pickImage({ source: 'library', square }).then(resolve) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}
