import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';
import type { DoseWindow, Medication } from './types';

export const DOSE_CHANNEL_ID = 'doses';
export const DOSE_CATEGORY_ID = 'dose';
export const TAKEN_ACTION_ID = 'taken';

/**
 * Android silently drops scheduled notifications unless a channel exists
 * first. There is no error and no warning — they simply never arrive. Call
 * this at app start, before scheduling anything.
 */
export const ensureNotificationChannel = async (): Promise<void> => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  // The fourth input in the degradation stack: answer without opening the app.
  await Notifications.setNotificationCategoryAsync(DOSE_CATEGORY_ID, [
    {
      identifier: TAKEN_ACTION_ID,
      buttonTitle: 'Taken',
      options: { opensAppToForeground: false },
    },
  ]);

  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(DOSE_CHANNEL_ID, {
    name: 'Dose reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;

  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
};

/**
 * Registers this device so the server can reach the caregiver when a dose goes
 * unconfirmed — the app cannot rely on someone opening it to find out.
 *
 * Safe to call on every launch; the insert upserts.
 */
export const registerForPush = async (): Promise<void> => {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) return;

    const token = await Notifications.getExpoPushTokenAsync({ projectId });

    await supabase.rpc('register_device', {
      p_push_token: token.data,
      p_platform: Platform.OS,
    });
  } catch {
    // Push is an enhancement. Never let it break startup.
  }
};

export const scheduleDoseReminders = async (
  windows: DoseWindow[],
  medications: Medication[],
): Promise<void> => {
  const granted = await requestNotificationPermission();
  if (!granted) return;

  // Cancel only OUR dose reminders. cancelAllScheduledNotificationsAsync would
  // wipe anything else the app ever schedules.
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of scheduled) {
    if (item.content.data?.['doseWindowId']) {
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
  }

  const now = Date.now();

  for (const window of windows) {
    if (window.state !== 'pending') continue;

    const at = Date.parse(window.scheduled_at);
    if (at <= now) continue;

    const medication = medications.find((m) => m.id === window.medication_id);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: medication?.name ?? 'Time for a dose',
        body: medication?.dose_text
          ? `${medication.dose_text} — tap the pill box when you take it.`
          : 'Tap the pill box when you take it.',
        categoryIdentifier: DOSE_CATEGORY_ID,
        data: { doseWindowId: window.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(at),
        channelId: DOSE_CHANNEL_ID,
      },
    });
  }
};

export const CHECK_IN_CHANNEL_ID = 'checkin';

/** Marks our own check-in reminders so we can clear them without touching doses. */
const CHECK_IN_TAG = 'checkInMemberId';

/**
 * The caregiver's own reminder — the first thing in this app that nudges the
 * family rather than the patient.
 *
 * Every other reminder here fires on her phone, which only helps if the problem
 * is that she forgot. For ninety days the family cannot visit, and the thing
 * that quietly stops happening is not the medication, it is the conversation.
 * Nobody schedules a visit; you just go. Take that away and weeks pass.
 *
 * Evening, once a day, one person, and only past the threshold. Reschedules
 * from scratch on every foreground so it stays idempotent, and clears itself
 * the moment a call is placed.
 */
export const scheduleCheckInReminder = async (
  nudge: { memberId: string; name: string } | null,
): Promise<void> => {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      if (item.content.data?.[CHECK_IN_TAG]) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }

    if (nudge === null) return;

    const granted = await requestNotificationPermission();
    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHECK_IN_CHANNEL_ID, {
        name: 'Check-in reminders',
        // Deliberately below the dose channel. A missed dose is urgent; this
        // is a nudge, and a nudge that behaves like an emergency gets muted.
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Call ${nudge.name}`,
        body: 'You cannot visit at the moment. A phone call still counts.',
        data: { [CHECK_IN_TAG]: nudge.memberId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 19,
        minute: 0,
        channelId: CHECK_IN_CHANNEL_ID,
      },
    });
  } catch {
    // A reminder is an enhancement. Never let it break a dashboard.
  }
};

/**
 * Handles the "Taken" button. Returns an unsubscribe function.
 */
export const listenForTakenAction = (onConfirmed: () => void): (() => void) => {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (response.actionIdentifier !== TAKEN_ACTION_ID) return;

    const id = response.notification.request.content.data?.['doseWindowId'];
    if (typeof id !== 'string') return;

    void supabase
      .rpc('confirm_dose', { p_dose_window_id: id, p_source: 'notification' })
      .then(() => onConfirmed());
  });

  return () => subscription.remove();
};
