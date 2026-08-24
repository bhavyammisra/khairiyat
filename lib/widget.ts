/**
 * The Android widget cannot reach Supabase — it renders in a headless task
 * with no session. So the app writes a compact summary to AsyncStorage every
 * time it foregrounds, and the widget renders from that snapshot.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { isTaken, needsAttention, refillRunway, runwayIsLow } from './doses';
import type { DoseState, DoseWindow, Medication, Member } from './types';

export const WIDGET_SNAPSHOT_KEY = 'khairiyat.widget.today';

export type WidgetMember = {
  name: string;
  states: DoseState[];
  taken: number;
  total: number;
  /** Any dose past its grace period with no confirmation. */
  needsAttention: boolean;
};

/** Only ever populated when stock is actually low. */
export type WidgetLowStock = {
  memberName: string;
  medicationName: string;
  days: number;
};

export type WidgetSnapshot = {
  familyName: string;
  members: WidgetMember[];
  lowStock: WidgetLowStock[];
  updatedAt: string;
};

export const buildSnapshot = (
  familyName: string,
  members: Member[],
  windows: DoseWindow[],
  medications: Medication[],
): WidgetSnapshot => {
  const rows: WidgetMember[] = [];

  for (const member of members) {
    const mine = windows
      .filter((w) => w.member_id === member.id)
      .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));

    if (mine.length === 0) continue;

    rows.push({
      name: member.name,
      states: mine.map((w) => w.state),
      taken: mine.filter((w) => isTaken(w.state)).length,
      total: mine.length,
      needsAttention: mine.some((w) => needsAttention(w.state)),
    });
  }

  // Running out causes more missed doses in India than forgetting does, and
  // nobody in the family usually knows. Surface it only when it is true.
  const lowStock: WidgetLowStock[] = [];

  for (const medication of medications) {
    const days = refillRunway(medication);
    if (!runwayIsLow(days) || days === null) continue;

    const owner = members.find((m) => m.id === medication.member_id);
    lowStock.push({
      memberName: owner?.name ?? '',
      medicationName: medication.name,
      days,
    });
  }

  lowStock.sort((a, b) => a.days - b.days);

  return {
    familyName,
    members: rows,
    lowStock: lowStock.slice(0, 2),
    updatedAt: new Date().toISOString(),
  };
};

export const writeSnapshot = async (snapshot: WidgetSnapshot): Promise<void> => {
  try {
    await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // The widget is the least important surface in the app. Never let it
    // break a screen.
  }
};

export const readSnapshot = async (): Promise<WidgetSnapshot | null> => {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as WidgetSnapshot) : null;
  } catch {
    return null;
  }
};
