/**
 * Run: npm test
 *
 * Node's built-in runner with type stripping — no test framework, no new
 * dependency. lib/doses.ts is the only real logic in the product (everything
 * else is CRUD and rendering), and it is derived entirely from tap timestamps,
 * so it is the part most worth pinning down.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  adherenceRate,
  doseStateLabel,
  driftInsight,
  driftSentence,
  isTaken,
  needsAttention,
  partOfDay,
  refillRunway,
  runwayIsLow,
  runwayLabel,
} from './doses.ts';
import type { DoseState, DoseWindow, Medication } from './types.ts';

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60_000;
const NOW = Date.parse('2026-08-23T12:00:00.000Z');

const medication = (over: Partial<Medication> = {}): Medication => ({
  id: 'med-1',
  member_id: 'mem-1',
  name: 'Amlodipine',
  dose_text: '5mg',
  times: ['08:00:00'],
  quantity_remaining: 30,
  units_per_dose: 1,
  active: true,
  created_at: new Date(NOW).toISOString(),
  ...over,
});

const window = (over: Partial<DoseWindow> = {}): DoseWindow => ({
  id: Math.random().toString(36).slice(2),
  medication_id: 'med-1',
  member_id: 'mem-1',
  family_id: 'fam-1',
  scheduled_at: new Date(NOW - DAY).toISOString(),
  state: 'confirmed',
  confirmed_at: new Date(NOW - DAY).toISOString(),
  source: 'nfc',
  resolved_by: null,
  resolved_at: null,
  is_extra: false,
  ...over,
});

describe('dose state', () => {
  it('counts confirmed and caregiver-resolved-taken as taken', () => {
    assert.equal(isTaken('confirmed'), true);
    assert.equal(isTaken('resolved_taken'), true);
    assert.equal(isTaken('pending'), false);
    assert.equal(isTaken('unconfirmed'), false);
    assert.equal(isTaken('resolved_missed'), false);
  });

  it('only flags unconfirmed as needing attention', () => {
    assert.equal(needsAttention('unconfirmed'), true);
    assert.equal(needsAttention('resolved_missed'), false);
  });

  it('never labels an unconfirmed dose as missed', () => {
    // The product's central claim: we do not assert a miss.
    assert.equal(doseStateLabel('unconfirmed'), 'No confirmation yet');
    assert.ok(!doseStateLabel('unconfirmed').toLowerCase().includes('miss'));
  });

  it('labels every state', () => {
    const states: DoseState[] = [
      'pending',
      'confirmed',
      'unconfirmed',
      'resolved_taken',
      'resolved_missed',
      'resolved_unreachable',
    ];
    for (const state of states) assert.ok(doseStateLabel(state).length > 0);
  });
});

describe('adherenceRate', () => {
  it('is null with nothing settled', () => {
    assert.equal(adherenceRate([], 14, NOW), null);
  });

  it('ignores windows that have not come due', () => {
    const windows = [
      window({ scheduled_at: new Date(NOW + DAY).toISOString(), state: 'pending' }),
      window({ scheduled_at: new Date(NOW - DAY).toISOString(), state: 'confirmed' }),
    ];
    assert.equal(adherenceRate(windows, 14, NOW), 1);
  });

  it('counts resolved_taken toward adherence but not resolved_missed', () => {
    const windows = [
      window({ scheduled_at: new Date(NOW - DAY).toISOString(), state: 'confirmed' }),
      window({ scheduled_at: new Date(NOW - 2 * DAY).toISOString(), state: 'resolved_taken' }),
      window({ scheduled_at: new Date(NOW - 3 * DAY).toISOString(), state: 'resolved_missed' }),
      window({ scheduled_at: new Date(NOW - 4 * DAY).toISOString(), state: 'unconfirmed' }),
    ];
    assert.equal(adherenceRate(windows, 14, NOW), 0.5);
  });

  it('excludes windows older than the requested span', () => {
    const windows = [
      window({ scheduled_at: new Date(NOW - 20 * DAY).toISOString(), state: 'resolved_missed' }),
      window({ scheduled_at: new Date(NOW - DAY).toISOString(), state: 'confirmed' }),
    ];
    assert.equal(adherenceRate(windows, 14, NOW), 1);
  });
});

describe('refillRunway', () => {
  it('divides remaining stock by daily consumption and floors', () => {
    assert.equal(refillRunway(medication({ quantity_remaining: 9, times: ['08:00:00'] })), 9);
    assert.equal(
      refillRunway(medication({ quantity_remaining: 9, times: ['08:00:00', '21:00:00'] })),
      4,
    );
  });

  it('accounts for more than one unit per dose', () => {
    assert.equal(
      refillRunway(medication({ quantity_remaining: 20, units_per_dose: 2 })),
      10,
    );
  });

  it('is null when the quantity was never recorded', () => {
    assert.equal(refillRunway(medication({ quantity_remaining: null })), null);
  });

  it('goes amber under five days only', () => {
    assert.equal(runwayIsLow(4), true);
    assert.equal(runwayIsLow(5), false);
    assert.equal(runwayIsLow(null), false);
  });

  it('reads naturally at the edges', () => {
    assert.equal(runwayLabel(null), 'No count yet');
    assert.equal(runwayLabel(0), 'Out today');
    assert.equal(runwayLabel(1), '1 day left');
    assert.equal(runwayLabel(4), '4 days left');
  });
});

describe('partOfDay', () => {
  it('calls 9pm evening, matching the demo copy', () => {
    assert.equal(partOfDay(8), 'morning');
    assert.equal(partOfDay(14), 'afternoon');
    assert.equal(partOfDay(21), 'evening');
    assert.equal(partOfDay(23), 'night');
  });
});

/**
 * Builds `count` days of one daily dose ending yesterday, each confirmed
 * `offsetFor(dayIndex)` minutes after its scheduled time.
 *
 * `hourUtc` takes a function so a test can move the UTC hour partway through
 * the series, which is what a daylight saving change looks like in the data.
 */
const series = (
  count: number,
  offsetFor: (dayIndex: number) => number | null,
  hourUtc: number | ((dayIndex: number) => number) = 15,
): DoseWindow[] => {
  const out: DoseWindow[] = [];

  for (let i = 0; i < count; i += 1) {
    const day = new Date(NOW - (count - i) * DAY);
    day.setUTCHours(typeof hourUtc === 'function' ? hourUtc(i) : hourUtc, 30, 0, 0);

    const offset = offsetFor(i);
    out.push(
      window({
        scheduled_at: day.toISOString(),
        state: offset === null ? 'unconfirmed' : 'confirmed',
        confirmed_at:
          offset === null ? null : new Date(day.getTime() + offset * MINUTE).toISOString(),
      }),
    );
  }

  return out;
};

describe('driftInsight', () => {
  it('reports nothing when timing is steady', () => {
    const windows = series(14, () => 5);
    assert.equal(driftInsight(windows, [medication()], NOW), null);
  });

  it('reports nothing when the change is under 20 minutes', () => {
    // prior ~5, recent ~20 => 15 minutes of movement, below the threshold.
    const windows = series(14, (i) => (i < 7 ? 5 : 20));
    assert.equal(driftInsight(windows, [medication()], NOW), null);
  });

  it('reports a real slide later', () => {
    const windows = series(14, (i) => (i < 7 ? 5 : 50));
    const insight = driftInsight(windows, [medication()], NOW);

    assert.ok(insight, 'expected an insight');
    assert.equal(insight.direction, 'later');
    assert.equal(insight.minutes, 45);
    assert.equal(insight.medicationName, 'Amlodipine');
  });

  it('reports movement earlier too', () => {
    const windows = series(14, (i) => (i < 7 ? 50 : 5));
    const insight = driftInsight(windows, [medication()], NOW);

    assert.ok(insight);
    assert.equal(insight.direction, 'earlier');
    assert.equal(insight.minutes, 45);
  });

  it('needs at least five samples in each period', () => {
    // Four confirmed in the recent week; the rest unconfirmed.
    const windows = series(14, (i) => {
      if (i < 7) return 5;
      return i >= 10 ? 50 : null;
    });
    assert.equal(driftInsight(windows, [medication()], NOW), null);
  });

  it('ignores ad-hoc extra doses', () => {
    const windows = series(14, (i) => (i < 7 ? 5 : 50)).map((w) => ({
      ...w,
      is_extra: true,
    }));
    assert.equal(driftInsight(windows, [medication()], NOW), null);
  });

  it('reports only the largest drift across medications', () => {
    const small = series(14, (i) => (i < 7 ? 5 : 35));
    const large = series(14, (i) => (i < 7 ? 5 : 70)).map((w) => ({
      ...w,
      medication_id: 'med-2',
    }));

    const insight = driftInsight(
      [...small, ...large],
      [medication(), medication({ id: 'med-2', name: 'Metformin' })],
      NOW,
    );

    assert.ok(insight);
    assert.equal(insight.medicationName, 'Metformin');
    assert.equal(insight.minutes, 65);
  });

  it('names the part of day from the medication schedule, not the UTC hour', () => {
    // 15:30 UTC is 21:00 in Asia/Kolkata, so an evening medication must read
    // "evening" even though the stored instant is mid-afternoon in UTC.
    const windows = series(14, (i) => (i < 7 ? 5 : 50));
    const evening = medication({ times: ['21:00:00'] });
    const insight = driftInsight(windows, [evening], NOW);

    assert.ok(insight);
    assert.equal(
      driftSentence(insight),
      'The evening Amlodipine dose has moved 45 minutes later over the last three weeks.',
    );
  });

  it('holds one slot together across a daylight saving shift', () => {
    // The same 08:30 local dose sits at 12:30 UTC under one offset and 13:30
    // under the other. Bucketing on the UTC minute alone splits fourteen days
    // into two sevens, each below the sample floor, and the drift vanishes
    // silently — the family is told nothing rather than told something wrong,
    // which is the worse of the two failures for this product.
    const windows = series(
      14,
      (i) => (i < 7 ? 5 : 50),
      (i) => (i < 7 ? 12 : 13),
    );

    const morning = medication({ times: ['08:30:00'] });
    const insight = driftInsight(windows, [morning], NOW);

    assert.ok(insight, 'expected the slot to survive the offset change');
    assert.equal(insight.partOfDay, 'morning');
    assert.equal(insight.direction, 'later');
    assert.equal(insight.minutes, 45);
  });

  it('keeps two doses a day apart when one slot crosses UTC midnight', () => {
    // 08:30 and 20:30 in America/New_York land at 12:30 and 00:30 UTC. Reading
    // the slots off the sorted UTC minute puts 00:30 first and labels the
    // evening dose "morning" — the sentence is read aloud on stage, so naming
    // the wrong half of the day is the whole insight being wrong.
    const morning = series(14, () => 5, 12);
    const evening = series(14, (i) => (i < 8 ? 5 : 50), 0);

    const med = medication({ times: ['08:30:00', '20:30:00'] });
    const insight = driftInsight([...morning, ...evening], [med], NOW, 'America/New_York');

    assert.ok(insight);
    assert.equal(insight.partOfDay, 'evening');
    assert.equal(insight.minutes, 45);
  });

  it('ignores windows whose scheduled time is no longer on the chart', () => {
    // The caregiver moved the dose. Old windows sit hours from any current
    // slot and must not be folded into the nearest one.
    const stale = series(14, (i) => (i < 7 ? 5 : 90), 3);
    const med = medication({ times: ['21:00:00'] });

    assert.equal(driftInsight(stale, [med], NOW, 'Asia/Kolkata'), null);
  });
});
