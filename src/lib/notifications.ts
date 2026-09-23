import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import { supabase } from './supabase';
import { log } from './log';
import { track } from './analytics';
import { tr } from '../i18n';
import type { Language } from '../types';

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
export async function ensureDailyReminder(language: Language = 'fr'): Promise<void> {
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
// Serializes concurrent scheduleDailyReminder calls: two launches (e.g. mount +
// language change) racing here both read prior=null and each scheduled a
// reminder, so the user got duplicate daily pushes. Chaining on this promise
// makes the cancel-then-schedule atomic across callers.
let schedulingChain: Promise<boolean> = Promise.resolve(false);

export async function scheduleDailyReminder(
  time: string,
  language: Language = 'fr',
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const run = schedulingChain.then(() => doScheduleDailyReminder(time, language), () => doScheduleDailyReminder(time, language));
  schedulingChain = run;
  return run;
}

// ── League reminder (opt-in via the league screens, fixed 10:00 local) ───────
// One global reminder covering all the user's leagues — the day's 3 drawn
// modes are the same everywhere, so a single 10:00 nudge is enough.

const LEAGUE_REMINDER_ENABLED_KEY = 'league:reminder_enabled';
const LEAGUE_REMINDER_ID_KEY = 'league:reminder_id';

/** Local hour the league reminder fires at (surfaced in the button copy). */
export const LEAGUE_REMINDER_HOUR = 10;

/** True when the user has turned the league reminder on (opt-in, default off). */
export async function isLeagueReminderEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LEAGUE_REMINDER_ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

/**
 * Re-schedule the league reminder on launch / language change when the user
 * opted in — same replace-any-prior semantics as ensureDailyReminder. No-ops on
 * web and for users who never enabled it.
 */
export async function ensureLeagueReminder(language: Language = 'fr'): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if ((await AsyncStorage.getItem(LEAGUE_REMINDER_ENABLED_KEY)) !== '1') return;
    await enableLeagueReminder(language);
  } catch (e) {
    log.debug('Ensure league reminder skipped:', e);
  }
}

// Serializes concurrent enable calls (launch ensure + button tap), mirroring
// the daily reminder's chain so we never stack two 10:00 notifications.
let leagueSchedulingChain: Promise<boolean> = Promise.resolve(false);

/**
 * Turn the league reminder on: repeating local notification every day at
 * 10:00 local time. Requests the OS permission if needed; returns false when
 * denied (callers surface that) or on web/simulators.
 */
export async function enableLeagueReminder(language: Language = 'fr'): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const run = leagueSchedulingChain.then(
    () => doEnableLeagueReminder(language),
    () => doEnableLeagueReminder(language),
  );
  leagueSchedulingChain = run;
  return run;
}

async function doEnableLeagueReminder(language: Language): Promise<boolean> {
  try {
    if (!(await ensurePermissionGranted())) return false;

    // Replace any prior schedule so we never stack reminders.
    const prior = await AsyncStorage.getItem(LEAGUE_REMINDER_ID_KEY);
    if (prior) await Notifications.cancelScheduledNotificationAsync(prior).catch(() => {});

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: tr(language, 'Ta ligue t’attend 🏆', 'Your league is waiting 🏆'),
        body:
          tr(language, 'Les 3 défis du jour sont tombés — joue-les avant tes amis !', 'Today’s 3 challenges just dropped — play them before your friends!'),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: LEAGUE_REMINDER_HOUR,
        minute: 0,
      },
    });

    await AsyncStorage.multiSet([
      [LEAGUE_REMINDER_ENABLED_KEY, '1'],
      [LEAGUE_REMINDER_ID_KEY, id],
    ]);
    return true;
  } catch (e) {
    log.debug('Enable league reminder skipped:', e);
    return false;
  }
}

/** Turn the league reminder off and cancel the scheduled notification. */
export async function disableLeagueReminder(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(LEAGUE_REMINDER_ID_KEY);
    if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await AsyncStorage.multiSet([
      [LEAGUE_REMINDER_ENABLED_KEY, '0'],
      [LEAGUE_REMINDER_ID_KEY, ''],
    ]);
  } catch (e) {
    log.debug('Disable league reminder skipped:', e);
  }
}

async function doScheduleDailyReminder(
  time: string,
  language: Language,
): Promise<boolean> {
  try {
    if (!(await ensurePermissionGranted())) return false;

    // Replace any prior schedule so we never stack reminders.
    const prior = await AsyncStorage.getItem(REMINDER_ID_KEY);
    if (prior) await Notifications.cancelScheduledNotificationAsync(prior).catch(() => {});

    const [h, m] = time.split(':').map((n) => parseInt(n, 10));
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'GeoG',
        body:
          tr(language, 'Ton défi du jour t’attend 🌍', 'Your daily challenge is waiting 🌍'),
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

// ── Streak guard (one-shot, the evening a streak ≥ 2 is about to break) ──────
// The 09:00 reminder is generic. Loss aversion is what actually brings people
// back: a player with a 5-day streak who has not played by early evening gets
// ONE notification saying exactly what they are about to lose. Cancelled the
// moment today's puzzle is done, re-armed on every launch / foreground.

const STREAK_GUARD_ID_KEY = 'daily:streak_guard_id';
/** Local hour the guard fires at, unless UTC midnight (the puzzle day) is sooner. */
export const STREAK_GUARD_HOUR = 20;
/** Never fire closer than this to the deadline — the player needs time to play. */
const STREAK_GUARD_MARGIN_MS = 3 * 60 * 60 * 1000;
/** Do not bother scheduling something that fires in the next few minutes. */
const STREAK_GUARD_MIN_LEAD_MS = 15 * 60 * 1000;

export interface StreakGuardPlan {
  /** When to fire. */
  at: Date;
  /** Whole hours left to play once it fires (what the copy says). */
  hoursLeft: number;
}

/**
 * Pure policy: when should tonight's guard fire, given the local streak and
 * whether today's puzzle is already done? `deadline` is the next UTC midnight
 * (the puzzle changes then). Returns null when there is nothing to protect,
 * the day is done, or it is already too late tonight.
 */
export function planStreakGuard(
  now: Date,
  deadline: Date,
  streak: number,
  playedToday: boolean,
): StreakGuardPlan | null {
  if (streak < 2 || playedToday) return null;
  const evening = new Date(now);
  evening.setHours(STREAK_GUARD_HOUR, 0, 0, 0);
  const latest = deadline.getTime() - STREAK_GUARD_MARGIN_MS;
  const at = new Date(Math.min(evening.getTime(), latest));
  if (at.getTime() - now.getTime() < STREAK_GUARD_MIN_LEAD_MS) return null;
  const hoursLeft = Math.max(1, Math.round((deadline.getTime() - at.getTime()) / 3_600_000));
  return { at, hoursLeft };
}

/** Cancel tonight's guard (today's puzzle is done, or nothing to protect). */
export async function cancelStreakGuard(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const id = await AsyncStorage.getItem(STREAK_GUARD_ID_KEY);
    if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await AsyncStorage.setItem(STREAK_GUARD_ID_KEY, '');
  } catch (e) {
    log.debug('Cancel streak guard skipped:', e);
  }
}

let streakGuardChain: Promise<void> = Promise.resolve();

/**
 * Arm (or disarm) tonight's guard from the local daily state. Safe to call on
 * every launch and foreground: it replaces any prior schedule, and it never
 * asks for the permission itself — the daily reminder already did, and a
 * player who refused it must not be asked twice.
 */
export function ensureStreakGuard(
  state: { streak: number; todayCount: number },
  language: Language = 'fr',
  now: Date = new Date(),
): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  const run = streakGuardChain.then(
    () => doEnsureStreakGuard(state, language, now),
    () => doEnsureStreakGuard(state, language, now),
  );
  streakGuardChain = run;
  return run;
}

async function doEnsureStreakGuard(
  state: { streak: number; todayCount: number },
  language: Language,
  now: Date,
): Promise<void> {
  try {
    const deadline = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const plan = planStreakGuard(now, deadline, state.streak, state.todayCount > 0);
    const prior = await AsyncStorage.getItem(STREAK_GUARD_ID_KEY);
    if (prior) await Notifications.cancelScheduledNotificationAsync(prior).catch(() => {});
    if (!plan) {
      if (prior) await AsyncStorage.setItem(STREAK_GUARD_ID_KEY, '');
      return;
    }
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: tr(language, 'Ta série de {0} jours est en danger 🔥', 'Your {0}-day streak is at risk 🔥', [state.streak]),
        body: tr(
          language,
          'Il te reste {0} h pour jouer le défi du jour et la garder.',
          'You have {0} h left to play today’s challenge and keep it.',
          [plan.hoursLeft],
        ),
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: plan.at },
    });
    await AsyncStorage.setItem(STREAK_GUARD_ID_KEY, id);
    track('streak_guard_scheduled', { streak: state.streak, hours_left: plan.hoursLeft });
  } catch (e) {
    log.debug('Ensure streak guard skipped:', e);
  }
}
