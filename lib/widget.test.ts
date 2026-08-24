/**
 * Run: npm test
 *
 * The widget is the one surface nobody can debug live — it renders in a
 * headless task, on a home screen, with no session and no console. Whatever
 * buildSnapshot puts in AsyncStorage is exactly what a family sees, so it is
 * worth pinning down here rather than by staring at a launcher.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import type { DoseWindow, Medication, Member } from './types.ts';

/* -------------------------------------------------------------------------- */
/* AsyncStorage stand-in                                                       */
/* -------------------------------------------------------------------------- */

const store = new Map<string, string>();
let storageBroken = false;

mock.module('@react-native-async-storage/async-storage', {
  defaultExport: {
    getItem: async (key: string): Promise<string | null> => {
      if (storageBroken) throw new Error('storage unavailable');
      return store.get(key) ?? null;
    },
    setItem: async (key: string, value: string): Promise<void> => {
      if (storageBroken) throw new Error('storage unavailable');
      store.set(key, value);
    },
  },
});

const { WIDGET_SNAPSHOT_KEY, buildSnapshot, readSnapshot, writeSnapshot } = await import(
  './widget.ts'
);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const NOW = Date.parse('2026-08-23T12:00:00.000Z');

const member = (over: Partial<Member> = {}): Member => ({
  id: 'mem-1',
  family_id: 'fam-1',
  user_id: null,
  name: 'Ammi',
  role: 'care_recipient',
  phone: null,
  timezone: 'Asia/Kolkata',
  created_at: new Date(NOW).toISOString(),
  ...over,
});

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
  scheduled_at: new Date(NOW).toISOString(),
  state: 'confirmed',
  confirmed_at: new Date(NOW).toISOString(),
  source: 'nfc',
  resolved_by: null,
  resolved_at: null,
  is_extra: false,
  ...over,
});

beforeEach(() => {
  store.clear();
  storageBroken = false;
});

/** Indexed access that satisfies noUncheckedIndexedAccess without a `!`. */
const at = <T>(xs: readonly T[], index: number): T => {
  const value = xs[index];
  if (value === undefined) throw new Error(`expected an item at index ${index}`);
  return value;
};

/* -------------------------------------------------------------------------- */

describe('buildSnapshot', () => {
  it('counts taken over total for each member', () => {
    const snapshot = buildSnapshot(
      'Sharma',
      [member()],
      [
        window({ state: 'confirmed' }),
        window({ state: 'resolved_taken' }),
        window({ state: 'pending' }),
      ],
      [],
    );

    assert.equal(snapshot.members.length, 1);
    assert.equal(at(snapshot.members, 0).name, 'Ammi');
    assert.equal(at(snapshot.members, 0).taken, 2);
    assert.equal(at(snapshot.members, 0).total, 3);
  });

  it('leaves out a member with no doses today rather than showing an empty row', () => {
    const snapshot = buildSnapshot('Sharma', [member(), member({ id: 'mem-2', name: 'Papa' })], [window()], []);

    assert.equal(snapshot.members.length, 1);
    assert.equal(at(snapshot.members, 0).name, 'Ammi');
  });

  it('orders the states by scheduled time so the rings read left to right', () => {
    const snapshot = buildSnapshot(
      'Sharma',
      [member()],
      [
        window({ scheduled_at: new Date(NOW + 3600_000).toISOString(), state: 'pending' }),
        window({ scheduled_at: new Date(NOW).toISOString(), state: 'confirmed' }),
      ],
      [],
    );

    assert.deepEqual(at(snapshot.members, 0).states, ['confirmed', 'pending']);
  });

  it('flags attention for an unconfirmed dose and not for a resolved one', () => {
    const unconfirmed = buildSnapshot('Sharma', [member()], [window({ state: 'unconfirmed' })], []);
    assert.equal(at(unconfirmed.members, 0).needsAttention, true);

    const resolved = buildSnapshot('Sharma', [member()], [window({ state: 'resolved_missed' })], []);
    assert.equal(at(resolved.members, 0).needsAttention, false);
  });

  it('reports low stock only when it is actually low', () => {
    const snapshot = buildSnapshot(
      'Sharma',
      [member()],
      [window()],
      [
        medication({ id: 'med-1', quantity_remaining: 3 }),
        medication({ id: 'med-2', name: 'Metformin', quantity_remaining: 60 }),
      ],
    );

    assert.equal(snapshot.lowStock.length, 1);
    assert.equal(at(snapshot.lowStock, 0).medicationName, 'Amlodipine');
    assert.equal(at(snapshot.lowStock, 0).days, 3);
    assert.equal(at(snapshot.lowStock, 0).memberName, 'Ammi');
  });

  it('says nothing about stock that was never counted', () => {
    const snapshot = buildSnapshot(
      'Sharma',
      [member()],
      [window()],
      [medication({ quantity_remaining: null })],
    );

    assert.deepEqual(snapshot.lowStock, []);
  });

  it('puts the most urgent refill first and shows at most two', () => {
    const snapshot = buildSnapshot(
      'Sharma',
      [member()],
      [window()],
      [
        medication({ id: 'a', name: 'A', quantity_remaining: 4 }),
        medication({ id: 'b', name: 'B', quantity_remaining: 1 }),
        medication({ id: 'c', name: 'C', quantity_remaining: 2 }),
      ],
    );

    assert.equal(snapshot.lowStock.length, 2);
    assert.deepEqual(
      snapshot.lowStock.map((s) => s.medicationName),
      ['B', 'C'],
    );
  });
});

describe('snapshot storage', () => {
  it('round-trips through the key the widget task reads', async () => {
    const snapshot = buildSnapshot('Sharma', [member()], [window()], []);
    await writeSnapshot(snapshot);

    assert.ok(store.has(WIDGET_SNAPSHOT_KEY), 'widget reads this exact key');
    assert.deepEqual(await readSnapshot(), snapshot);
  });

  it('is null before the app has ever foregrounded', async () => {
    assert.equal(await readSnapshot(), null);
  });

  it('never lets a storage failure escape into a screen', async () => {
    storageBroken = true;

    // The widget is the least important surface in the app. Neither call may
    // reject — a home screen that cannot be drawn must not take the dashboard
    // down with it.
    await writeSnapshot(buildSnapshot('Sharma', [member()], [window()], []));
    assert.equal(await readSnapshot(), null);
  });
});
