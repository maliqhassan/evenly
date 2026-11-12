import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { api } from '@/api';
import { isDemo } from '@/lib/config';
import { captureError } from '@/lib/monitoring';

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

/**
 * Ask for permission (once) and register this device's Expo push token.
 * Silently does nothing on simulators, in demo mode, or if denied — the
 * in-app notification list still works.
 */
export async function registerForPush(): Promise<void> {
  const Notifications = load();
  if (!Notifications || !Device.isDevice) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Evenly',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

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
