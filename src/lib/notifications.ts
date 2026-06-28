import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import { supabase } from './supabase';
import { log } from './log';

/**
 * AsyncStorage keys for the daily reminder. The reminder is ON by default for
 * everyone — only an explicit '0' (the user disabled it) turns it off.
 */
const REMINDER_ENABLED_KEY = 'daily:reminder_enabled';
const REMINDER_TIME_KEY = 'daily:reminder_time'; // "HH:MM" (local time)
const REMINDER_ID_KEY = 'daily:reminder_id';

/** Default reminder time when the user has never picked one. */
const DEFAULT_REMINDER_TIME = '09:00';

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
 * Ensure the OS notification permission is granted, requesting it once if
 * needed. The in-flight request is memoized so that callers firing at the same
 * time (push registration + daily reminder on launch) share a single native
 * prompt instead of stacking two dialogs.
 */
let permissionRequest: Promise<boolean> | null = null;
async function ensurePermissionGranted(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  if (!permissionRequest) {
    permissionRequest = Notifications.requestPermissionsAsync()
      .then((r) => r.status === 'granted')
      .catch(() => false)
      .finally(() => {
        permissionRequest = null;
      });
  }
  return permissionRequest;
}

/**
 * Registers the device for Expo push notifications and stores the token on the
 * user's profile so the backend can target them. Safe to call on every login —
 * no-ops on web, simulators, or when permission is denied.
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  // Push tokens are only available on physical iOS/Android devices.
  if (Platform.OS === 'web' || !Device.isDevice) return;

  try {
    if (!(await ensurePermissionGranted())) return;

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
    log.debug('Push registration skipped:', e);
  }
}

// ── Daily reminder (on by default, local scheduled notification) ──────────────

export interface DailyReminderPrefs {
  enabled: boolean;
  /** Local time as "HH:MM" (24h). */
  time: string;
}

/**
 * Read the stored daily-reminder preference. The reminder is ON by default for
 * everyone: it counts as enabled unless the user has explicitly turned it off
 * (stored as '0'). Default time is 09:00.
 */
export async function getDailyReminderPrefs(): Promise<DailyReminderPrefs> {
  try {
    const [enabled, time] = await Promise.all([
      AsyncStorage.getItem(REMINDER_ENABLED_KEY),
      AsyncStorage.getItem(REMINDER_TIME_KEY),
    ]);
    return { enabled: enabled !== '0', time: time ?? DEFAULT_REMINDER_TIME };
  } catch {
    return { enabled: true, time: DEFAULT_REMINDER_TIME };
  }
}

/**
 * Auto-enable the daily reminder for everyone. Schedules it on launch unless the
 * user has explicitly opted out. Safe to call on every launch / language change —
 * it replaces any prior schedule and no-ops on web or after an explicit opt-out.
 */
export async function ensureDailyReminder(language: 'fr' | 'en' = 'fr'): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const enabled = await AsyncStorage.getItem(REMINDER_ENABLED_KEY);
    // Respect an explicit opt-out; otherwise default ON.
    if (enabled === '0') return;
    const time = (await AsyncStorage.getItem(REMINDER_TIME_KEY)) ?? DEFAULT_REMINDER_TIME;
    await scheduleDailyReminder(time, language);
  } catch (e) {
    log.debug('Ensure daily reminder skipped:', e);
  }
}

/** Cancel any previously scheduled daily reminder. */
export async function cancelDailyReminder(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(REMINDER_ID_KEY);
    if (id) await Notifications.cancelScheduledNotificationAsync(id);
    await AsyncStorage.multiSet([
      [REMINDER_ENABLED_KEY, '0'],
      [REMINDER_ID_KEY, ''],
    ]);
  } catch (e) {
    log.debug('Cancel daily reminder skipped:', e);
  }
}

/**
 * Schedule (or reschedule) a repeating local notification at `time` ("HH:MM",
 * local). Requests permission if needed. Returns true when scheduled. Safe on
 * web/simulators (returns false without throwing).
 */
export async function scheduleDailyReminder(
  time: string,
  language: 'fr' | 'en' = 'fr',
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (!(await ensurePermissionGranted())) return false;

    // Replace any prior schedule so we never stack reminders.
    const prior = await AsyncStorage.getItem(REMINDER_ID_KEY);
    if (prior) await Notifications.cancelScheduledNotificationAsync(prior).catch(() => {});

    const [h, m] = time.split(':').map((n) => parseInt(n, 10));
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: language === 'fr' ? 'GeoRankle' : 'GeoRankle',
        body:
          language === 'fr'
            ? 'Ton défi du jour t’attend 🌍'
            : 'Your daily challenge is waiting 🌍',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: Number.isFinite(h) ? h : 9,
        minute: Number.isFinite(m) ? m : 0,
      },
    });

    await AsyncStorage.multiSet([
      [REMINDER_ENABLED_KEY, '1'],
      [REMINDER_TIME_KEY, time],
      [REMINDER_ID_KEY, id],
    ]);
    return true;
  } catch (e) {
    log.debug('Schedule daily reminder skipped:', e);
    return false;
  }
}
