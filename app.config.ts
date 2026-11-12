import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Expo app config. Values that differ per environment come from env vars
 * (see .env.example); nothing secret belongs here.
 */
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
// Google Sign-In on iOS needs the *reversed* iOS client ID as a URL scheme.
const iosUrlScheme = iosClientId
  ? `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
  : undefined;
// Android push (FCM) needs Firebase's google-services.json at build time. It is
// downloaded from the Firebase console and kept out of git.
const googleServicesFile = existsSync(join(__dirname, 'google-services.json')) ? './google-services.json' : undefined;
const inviteHost = (process.env.EXPO_PUBLIC_INVITE_BASE_URL ?? 'https://evenly.app/j')
  .replace(/^https?:\/\//, '')
  .split('/')[0];
const bundleId = process.env.APP_BUNDLE_ID ?? 'app.evenly.mobile';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Evenly',
  slug: 'evenly',
  scheme: 'evenly',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/images/icon.png',
  backgroundColor: '#F4F5F3',
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: false,
    associatedDomains: [`applinks:${inviteHost}`],
    infoPlist: {
      NSCameraUsageDescription: 'Evenly uses the camera to photograph receipts and set your profile photo.',
      NSPhotoLibraryUsageDescription: 'Evenly lets you attach receipt photos and choose a profile photo.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: bundleId,
    ...(googleServicesFile ? { googleServicesFile } : {}),
    adaptiveIcon: {
      backgroundColor: '#26302A',
      foregroundImage: './assets/images/android-icon-foreground.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: inviteHost, pathPrefix: '/j/' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: { output: 'static', favicon: './assets/images/favicon.png' },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { backgroundColor: '#26302A', image: './assets/images/splash-icon.png', imageWidth: 76 }],
    // The plugin only configures the iOS URL scheme and throws without one, so
    // it is added once EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set (required for iOS builds).
    // Android needs no plugin config; the native module autolinks.
    ...(iosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme }] as [string, object]] : []),
    'expo-secure-store',
    'expo-sqlite',
    'expo-localization',
    [
      'expo-notifications',
      // Status-bar icon and colour for notifications, and the channel Android
      // uses for pushes it displays itself (created in src/lib/push.ts).
      { color: '#26302A', icon: './assets/images/notification-icon.png', defaultChannel: 'activity' },
    ],
    // Android: start with the system navigation buttons hidden (swipe up to show them).
    ['expo-navigation-bar', { hidden: true }],
    [
      'expo-image-picker',
      {
        photosPermission: 'Evenly lets you attach receipt photos and choose a profile photo.',
        cameraPermission: 'Evenly uses the camera to photograph receipts and set your profile photo.',
      },
    ],
    'expo-font',
    'expo-web-browser',
    ['@sentry/react-native', { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT }],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
});
