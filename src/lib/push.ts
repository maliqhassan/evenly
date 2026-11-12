import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { api } from '@/api';
import { isDemo } from '@/lib/config';
import { confirmDialog, showPermissionBlocked } from '@/lib/media';
import { captureError } from '@/lib/monitoring';
import { secureStorage } from '@/lib/secure-storage';

type NotificationsModule = typeof import('expo-notifications');
let N: NotificationsModule | null = null;
const load = (): NotificationsModule | null => {
  if (N || isDemo) return N;
  try {
    N = require('expo-notifications') as NotificationsModule;
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });
  } catch {
    N = null;
  }
  return N;
};

let registeredToken: string | null = null;

/** Set once the user answers "Not now", so the app doesn't ask on every launch. */
const DECLINED_KEY = 'evenly.push.declined.v1';

/**
 * Register this device for push. Before the system permission prompt (which
 * the app can't style) it shows a themed explanation, and only asks the
 * system if the user agrees.
 *
 * - On entering the app: asks once; "Not now" is remembered.
 * - From Notification settings (`fromSettings`): the user just turned push on,
 *   so it asks the system directly, or offers to open the phone's settings if
 *   notifications are blocked there.
 *
 * Silently does nothing on simulators, in demo mode, or if declined — the
 * in-app notification list still works.
 */
export async function registerForPush(opts: { fromSettings?: boolean } = {}): Promise<void> {
  const Notifications = load();
  if (!Notifications || !Device.isDevice) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Evenly',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) {
      if (!perm.canAskAgain) {
        if (opts.fromSettings) {
          showPermissionBlocked(
            'Notification',
            'Evenly sends a notification when someone adds an expense, settles up or invites you.',
            'bell',
          );
        }
        return;
      }
      if (!opts.fromSettings) {
        if (await secureStorage.getItem(DECLINED_KEY).catch(() => null)) return;
        const ok = await confirmDialog(
          'Turn on notifications?',
          'Get a notification when someone adds an expense, settles up with you or invites you to a group.',
          'Turn on',
          { icon: 'bell' },
        );
        if (!ok) {
          await secureStorage.setItem(DECLINED_KEY, '1').catch(() => undefined);
          return;
        }
      }
      perm = await Notifications.requestPermissionsAsync();
      if (!perm.granted) return;
    }
    await secureStorage.removeItem(DECLINED_KEY).catch(() => undefined);

    let token: string | null = null;
    if (Platform.OS === 'android') {
      // Native FCM token: the push-dispatch function sends to it through
      // Firebase Cloud Messaging directly (needs google-services.json in the build).
      token = (await Notifications.getDevicePushTokenAsync()).data as string;
    } else {
      // iOS goes through Expo's push service, which needs an EAS project.
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) return;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    }
    if (token && token !== registeredToken) {
      await api.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
      registeredToken = token;
    }
  } catch (e) {
    captureError(e, { where: 'registerForPush' });
  }
}

export async function unregisterPush(): Promise<void> {
  if (!registeredToken) return;
  try {
    await api.unregisterPushToken(registeredToken);
  } catch {
    // best effort
  }
  registeredToken = null;
}

/** Route to the right screen for a notification payload. */
export function routeForNotification(data: Record<string, unknown> | undefined) {
  if (!data) return;
  if (typeof data.expense_id === 'string') router.push({ pathname: '/expense/[id]', params: { id: data.expense_id } });
  else if (data.type === 'settlement_pending' || typeof data.settlement_id === 'string') router.push('/settle');
  else if (data.type === 'group_invite') router.push('/notifications');
  else if (typeof data.group_id === 'string') router.push({ pathname: '/groups/[id]', params: { id: data.group_id } });
  else router.push('/notifications');
}

/** Handle taps on push notifications (call once when signed in). */
export function listenForNotificationTaps(): () => void {
  const Notifications = load();
  if (!Notifications) return () => undefined;
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    routeForNotification(response.notification.request.content.data as Record<string, unknown>);
  });
  return () => sub.remove();
}
