import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Height of the on-screen keyboard on Android, 0 when hidden (always 0 on iOS,
 * where KeyboardAvoidingView handles it).
 *
 * The app is edge-to-edge, so Android no longer resizes the window for the
 * keyboard. React Native reports the keyboard height above the system
 * navigation bar, so the area it covers is this height plus the bottom inset.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
