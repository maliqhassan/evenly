import { requireOptionalNativeModule } from 'expo-modules-core';

/** One line of text found in the photo, with its box in pixels. */
export interface RecognizedLine {
  text: string;
  bounds: { x: number; y: number; width: number; height: number } | null;
}

export interface RecognizedBlock {
  text: string;
  lines: RecognizedLine[];
}

export interface RecognizedText {
  text: string;
  blocks: RecognizedBlock[];
}

interface ReceiptTextNative {
  recognizeText(uri: string): Promise<RecognizedText>;
}

/**
 * On-device text recognition (Google ML Kit, Latin script). Null when the
 * native module isn't in this build: demo mode builds, web, or Expo Go.
 */
export const ReceiptText = requireOptionalNativeModule<ReceiptTextNative>('ReceiptText');
