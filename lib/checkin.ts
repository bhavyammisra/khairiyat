/**
 * How long since anyone in the family actually spoke to her.
 *
 * The rest of the app tracks whether a pill was taken. That is not the same
 * question as whether she is all right, and for ninety days nobody is allowed
 * to gather and find out the way families normally do — by turning up. A tap
 * on a pill box is a very thin substitute for a visit, and a dashboard full of
 * confirmed doses can look completely healthy while nobody has heard her voice
 * in a fortnight.
 *
 * So the one thing a visit used to guarantee gets its own signal: a call, who
 * made it, and how long ago.
 *
 * Stored on the device rather than the server on purpose. It is a nudge for
 * the person holding the phone, not a record of how attentive a relative has
 * been — that is a thing families would end up arguing about, and the app
 * should not hand anyone the ammunition.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Member } from './types';

const KEY = 'khairiyat.lastSpoke';
const DAY = 24 * 60 * 60 * 1000;

/** memberId → ISO timestamp of the last call placed from this phone. */
export type CallLog = Record<string, string>;

/** Quiet by default. Below this many days, say nothing at all. */
export const NUDGE_AFTER_DAYS = 3;

export const readCallLog = async (): Promise<CallLog> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CallLog) : {};
  } catch {
    return {};
  }
};

export const recordCall = async (memberId: string, at = new Date()): Promise<void> => {
  try {
    const log = await readCallLog();
    log[memberId] = at.toISOString();
    await AsyncStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // A nudge that fails to save just means she gets nudged again. Harmless.
  }
};

/** Whole days since the last call. Null when this phone has never called her. */
export const daysSinceCall = (
  log: CallLog,
  memberId: string,
  now = Date.now(),
): number | null => {
  const last = log[memberId];
  if (last === undefined) return null;

  const at = Date.parse(last);
  if (Number.isNaN(at)) return null;

  return Math.max(0, Math.floor((now - at) / DAY));
};

export type CheckInNudge = {
  memberId: string;
  name: string;
  /** Null when there is no record of a call at all. */
  days: number | null;
};

/**
 * The one person most overdue a call, or null when the family is up to date.
 *
 * Care recipients only — nudging someone to ring their own brother, who is
 * also a caregiver and perfectly able to ring back, is noise.
 *
 * Someone never called ranks above everyone, then longest gap first. Only one
 * is ever returned: a list of four people you have neglected is a guilt trip,
 * and a guilt trip gets the notifications turned off.
 */
export const checkInNudge = (
  members: Member[],
  log: CallLog,
  now = Date.now(),
  after = NUDGE_AFTER_DAYS,
): CheckInNudge | null => {
  let best: CheckInNudge | null = null;

  for (const member of members) {
    if (member.role !== 'care_recipient') continue;

    const days = daysSinceCall(log, member.id, now);
    if (days !== null && days < after) continue;

    const candidate: CheckInNudge = { memberId: member.id, name: member.name, days };

    if (best === null) {
      best = candidate;
      continue;
    }

    if (best.days === null) continue;
    if (days === null || days > best.days) best = candidate;
  }

  return best;
};

/** One sentence for the dashboard card. Warm, never scolding. */
export const checkInSentence = (nudge: CheckInNudge): string => {
  if (nudge.days === null) return `You have not called ${nudge.name} from this phone yet.`;
  if (nudge.days === 1) return `It has been a day since you called ${nudge.name}.`;
  return `It has been ${nudge.days} days since you called ${nudge.name}.`;
};
