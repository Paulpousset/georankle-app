import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import { supabase } from './supabase';

// Show notifications as banners even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registers the device for Expo push notifications and stores the token on the
 * user's profile so the backend can target them. Safe to call on every login —
 * no-ops on web, simulators, or when permission is denied.
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  // Push tokens are only available on physical iOS/Android devices.
  if (Platform.OS === 'web' || !Device.isDevice) return;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    if (token) {
      await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
    }
  } catch (e) {
    // Never let notification setup crash the app.
    console.log('Push registration skipped:', e);
  }
}
