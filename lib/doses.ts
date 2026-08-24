/**
 * Dose window state, adherence drift, refill runway.
 *
 * This lives in JS rather than SQL deliberately — it is cheap here and far
 * easier to tune under time pressure. Everything below is derived from nothing
 * but tap timestamps, which is the whole technical claim of the product.
 */

import type { DoseState, DoseWindow, Medication } from './types';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/* -------------------------------------------------------------------------- */
/* State                                                                       */
/* -------------------------------------------------------------------------- */

/** Did the medication actually get into her, however we found out. */
export const isTaken = (state: DoseState): boolean =>
  state === 'confirmed' || state === 'resolved_taken';

/** Needs a human. This is the state the whole product exists to surface. */
export const needsAttention = (state: DoseState): boolean => state === 'unconfirmed';

/**
 * Never blame her. We do not know she missed it — we know nobody confirmed it.
 * Pair this with the DoseRing shape; state is never conveyed by colour alone.
 */
export const doseStateLabel = (state: DoseState): string => {
  switch (state) {
    case 'pending':
      return 'Due';
    case 'confirmed':
      return 'Taken';
    case 'unconfirmed':
      return 'No confirmation yet';
    case 'resolved_taken':
      return 'Taken';
    case 'resolved_missed':
      return 'Missed';
    case 'resolved_unreachable':
      return 'Not reached';
  }
};

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** "Morning" / "Afternoon" / "Evening" / "Night" from a local hour. */
export const partOfDay = (hour: number): string => {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
};

/* -------------------------------------------------------------------------- */
/* Adherence                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Confirmed plus resolved-taken, over every window that has already come due,
 * across the last 14 days. Windows still pending are not counted against her.
 */
export const adherenceRate = (windows: DoseWindow[], days = 14, now = Date.now()): number | null => {
  const since = now - days * DAY;

  const settled = windows.filter((w) => {
    const at = Date.parse(w.scheduled_at);
    return at >= since && at <= now && w.state !== 'pending';
  });

  if (settled.length === 0) return null;

  return settled.filter((w) => isTaken(w.state)).length / settled.length;
};

/* -------------------------------------------------------------------------- */
/* Refill runway                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Days until she runs out. Running out of medication causes more missed doses
 * in India than forgetting does, and nobody in the family usually knows.
 *
 * Null when we were never told the quantity.
 */
export const refillRunway = (medication: Medication): number | null => {
  const { quantity_remaining, units_per_dose, times } = medication;

  if (quantity_remaining === null) return null;

  const perDay = units_per_dose * times.length;
  if (perDay <= 0) return null;

  return Math.floor(quantity_remaining / perDay);
};

/** Amber under 5 days. */
export const runwayIsLow = (days: number | null): boolean => days !== null && days < 5;

export const runwayLabel = (days: number | null): string => {
  if (days === null) return 'No count yet';
  if (days === 0) return 'Out today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
};

/* -------------------------------------------------------------------------- */
/* Drift                                                                       */
/* -------------------------------------------------------------------------- */

export type DriftInsight = {
  medicationName: string;
  partOfDay: string;
  /** Always positive. Read with `direction`. */
  minutes: number;
  direction: 'later' | 'earlier';
};

type Bucket = { recent: number[]; prior: number[] };

const MINUTES_PER_DAY = 1440;

/**
 * How far apart two times of day are, the short way round the clock.
 * 23:50 and 00:10 are twenty minutes apart, not twenty-three hours.
 */
const clockDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % MINUTES_PER_DAY;
  return Math.min(d, MINUTES_PER_DAY - d);
};

const utcMinuteOfDay = (ms: number): number => {
  const d = new Date(ms);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

/** 'HH:MM:SS' as Postgres returns a time[], to minutes since local midnight. */
const localMinuteOfDay = (time: string): number =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * Minutes to ADD to a local wall-clock time to get the UTC one, at a given
 * instant. Positive west of Greenwich.
 *
 * Null when the runtime has no usable timezone database. Hermes on Android
 * carries one, but it is not worth crashing the member screen over if a build
 * ever ships without it — the caller falls back to reading the shift out of
 * the data.
 */
const utcShiftMinutes = (timezone: string, at: number): number | null => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(at));

    const part = (type: string): number => {
      const found = parts.find((p) => p.type === type);
      return found ? Number(found.value) : NaN;
    };

    const asIfUtc = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      // Some ICU builds render midnight as hour 24 under hour12: false.
      part('hour') % 24,
      part('minute'),
      part('second'),
    );

    if (Number.isNaN(asIfUtc)) return null;

    return Math.round((at - asIfUtc) / MINUTE);
  } catch {
    return null;
  }
};

/**
 * Recovers the shift from the data when we have no timezone to ask.
 *
 * Every scheduled window sits exactly on one of the medication's times, so the
 * true shift is `observed - slot` for some slot. There are only a handful of
 * candidates; pick the one that puts every window closest to a slot.
 */
const estimateShift = (observed: number[], slots: number[]): number => {
  let best = 0;
  let bestCost = Infinity;

  for (const anchor of observed.slice(0, 4)) {
    for (const slot of slots) {
      const shift = anchor - slot;
      let cost = 0;

      for (const o of observed) {
        let nearest = Infinity;
        for (const s of slots) nearest = Math.min(nearest, clockDistance(o, s + shift));
        cost += nearest;
      }

      if (cost < bestCost) {
        bestCost = cost;
        best = shift;
      }
    }
  }

  return best;
};

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * A window counts toward a scheduled time only if it lands within this much of
 * it. Comfortably absorbs a daylight saving hour, while keeping two doses of a
 * real prescription — never less than a few hours apart — in separate buckets.
 * A window further out than this belongs to a time that has since been edited,
 * and folding it in would invent a drift of hours that never happened.
 */
const SLOT_TOLERANCE_MINUTES = 90;

/**
 * For each medication and each scheduled time, compare the mean lateness of the
 * last 7 days against the 7 days before it.
 *
 * Reports at most ONE sentence, about ONE medication — the largest drift — and
 * only when the change exceeds 20 minutes with at least 5 samples in each
 * period. Never show a chart of noise. This needs to produce one true sentence,
 * not a model.
 *
 * Windows are grouped by which of the medication's OWN scheduled times they sit
 * nearest to, rather than by the raw UTC minute. The two are the same thing in
 * India, which has no daylight saving — but anywhere that does, a single 8am
 * dose moves an hour in UTC twice a year, splits one fourteen-day bucket into
 * two sevens, drops both under the sample floor, and the insight disappears
 * with nothing to show that it did. Pass `timezone` (from `member.timezone`)
 * and the shift is exact per window; without it, it is read out of the data.
 *
 * Lateness itself is `confirmed_at - scheduled_at`, so it never depended on any
 * of this.
 */
export const driftInsight = (
  windows: DoseWindow[],
  medications: Medication[],
  now = Date.now(),
  timezone?: string,
): DriftInsight | null => {
  const MIN_SAMPLES = 5;
  const MIN_CHANGE_MINUTES = 20;

  const recentFrom = now - 7 * DAY;
  const priorFrom = now - 14 * DAY;

  type Sample = { scheduled: number; offset: number };
  const byMedication = new Map<string, Sample[]>();

  for (const w of windows) {
    if (w.state !== 'confirmed' || w.confirmed_at === null || w.is_extra) continue;

    const scheduled = Date.parse(w.scheduled_at);
    if (scheduled < priorFrom || scheduled > now) continue;

    const samples = byMedication.get(w.medication_id);
    const sample = { scheduled, offset: (Date.parse(w.confirmed_at) - scheduled) / MINUTE };

    if (samples) samples.push(sample);
    else byMedication.set(w.medication_id, [sample]);
  }

  let best: DriftInsight | null = null;

  for (const [medicationId, samples] of byMedication) {
    const medication = medications.find((m) => m.id === medicationId);
    if (!medication) continue;

    const slots = [...medication.times].sort().map(localMinuteOfDay);
    if (slots.length === 0) continue;

    const observed = samples.map((s) => utcMinuteOfDay(s.scheduled));
    const fallbackShift = estimateShift(observed, slots);

    const buckets = new Map<number, Bucket>();

    for (const sample of samples) {
      const shift = (timezone ? utcShiftMinutes(timezone, sample.scheduled) : null) ?? fallbackShift;
      const minute = utcMinuteOfDay(sample.scheduled);

      let nearest = -1;
      let nearestDistance = Infinity;

      slots.forEach((slot, index) => {
        const distance = clockDistance(minute, slot + shift);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = index;
        }
      });

      if (nearest < 0 || nearestDistance > SLOT_TOLERANCE_MINUTES) continue;

      let bucket = buckets.get(nearest);
      if (!bucket) {
        bucket = { recent: [], prior: [] };
        buckets.set(nearest, bucket);
      }

      if (sample.scheduled >= recentFrom) bucket.recent.push(sample.offset);
      else bucket.prior.push(sample.offset);
    }

    for (const [index, bucket] of buckets) {
      const slot = slots[index];
      if (slot === undefined) continue;
      if (bucket.recent.length < MIN_SAMPLES || bucket.prior.length < MIN_SAMPLES) continue;

      const change = mean(bucket.recent) - mean(bucket.prior);
      if (Math.abs(change) < MIN_CHANGE_MINUTES) continue;
      if (best !== null && Math.abs(change) <= best.minutes) continue;

      best = {
        medicationName: medication.name,
        // Straight off the slot's own local time — no index matching between
        // two separately sorted lists, which is what got the wrapped-past-
        // midnight dose labelled "morning".
        partOfDay: partOfDay(Math.floor(slot / 60)),
        minutes: Math.round(Math.abs(change)),
        direction: change > 0 ? 'later' : 'earlier',
      };
    }
  }

  return best;
};

/** One sentence, read aloud on stage. Keep it plain. */
export const driftSentence = (insight: DriftInsight): string =>
  `The ${insight.partOfDay} ${insight.medicationName} dose has moved ` +
  `${insight.minutes} minutes ${insight.direction} over the last three weeks.`;
