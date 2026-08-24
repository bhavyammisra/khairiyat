/**
 * Offline tap queue.
 *
 * A tap is the one thing the product must never lose. If the network is down
 * when the sticker is tapped, she still took the pill — so the tap is written
 * to disk with the time it happened and replayed later. The server records it
 * against the moment of the tap, not the moment of the sync (see 007).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';
import type { LogSource } from './types';

const KEY = 'khairiyat.pendingTaps';

export type PendingTap =
  | { kind: 'tag'; token: string; source: LogSource; at: string }
  | { kind: 'dose'; doseWindowId: string; source: LogSource; at: string };

const read = async (): Promise<PendingTap[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingTap[]) : [];
  } catch {
    return [];
  }
};

const write = async (taps: PendingTap[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(taps));
  } catch {
    // Nothing useful to do — the dose is already lost at this point.
  }
};

export const enqueue = async (tap: PendingTap): Promise<void> => {
  const taps = await read();
  taps.push(tap);
  await write(taps);
};

export const pendingCount = async (): Promise<number> => (await read()).length;

const send = async (tap: PendingTap): Promise<boolean> => {
  const { error } =
    tap.kind === 'tag'
      ? await supabase.rpc('resolve_tag', {
          p_token: tap.token,
          p_source: tap.source,
          p_at: tap.at,
        })
      : await supabase.rpc('confirm_dose', {
          p_dose_window_id: tap.doseWindowId,
          p_source: tap.source,
          p_at: tap.at,
        });

  return !error;
};

/**
 * Replays everything queued. Returns how many synced.
 *
 * Stops at the first transport failure so ordering is preserved and we do not
 * hammer a dead connection. A tap the server rejects outright is dropped —
 * retrying it forever would block every tap behind it.
 */
export const flush = async (): Promise<number> => {
  const taps = await read();
  if (taps.length === 0) return 0;

  let synced = 0;

  for (const tap of taps) {
    const ok = await send(tap);
    if (!ok) break;
    synced += 1;
  }

  if (synced > 0) await write(taps.slice(synced));
  return synced;
};
