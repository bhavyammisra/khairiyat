/**
 * Run: npm test
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import type { Member } from './types.ts';

const store = new Map<string, string>();

mock.module('@react-native-async-storage/async-storage', {
  defaultExport: {
    getItem: async (key: string): Promise<string | null> => store.get(key) ?? null,
    setItem: async (key: string, value: string): Promise<void> => {
      store.set(key, value);
    },
  },
});

const {
  checkInNudge,
  checkInSentence,
  daysSinceCall,
  readCallLog,
  recordCall,
} = await import('./checkin.ts');

const NOW = Date.parse('2026-08-23T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const member = (over: Partial<Member> = {}): Member => ({
  id: 'mem-1',
  family_id: 'fam-1',
  user_id: null,
  name: 'Ammi',
  role: 'care_recipient',
  phone: '+919876543210',
  timezone: 'Asia/Kolkata',
  created_at: new Date(NOW).toISOString(),
  ...over,
});

const ago = (days: number): string => new Date(NOW - days * DAY).toISOString();

beforeEach(() => store.clear());

describe('daysSinceCall', () => {
  it('is null when this phone has never called her', () => {
    assert.equal(daysSinceCall({}, 'mem-1', NOW), null);
  });

  it('floors to whole days', () => {
    assert.equal(daysSinceCall({ 'mem-1': ago(0) }, 'mem-1', NOW), 0);
    assert.equal(daysSinceCall({ 'mem-1': new Date(NOW - 1.9 * DAY).toISOString() }, 'mem-1', NOW), 1);
    assert.equal(daysSinceCall({ 'mem-1': ago(9) }, 'mem-1', NOW), 9);
  });

  it('never goes negative on a clock that has drifted forward', () => {
    assert.equal(daysSinceCall({ 'mem-1': ago(-3) }, 'mem-1', NOW), 0);
  });

  it('survives a corrupted timestamp', () => {
    assert.equal(daysSinceCall({ 'mem-1': 'not a date' }, 'mem-1', NOW), null);
  });
});

describe('checkInNudge', () => {
  it('stays quiet when she was called recently', () => {
    assert.equal(checkInNudge([member()], { 'mem-1': ago(1) }, NOW), null);
  });

  it('stays quiet on the day before the threshold', () => {
    assert.equal(checkInNudge([member()], { 'mem-1': ago(2) }, NOW), null);
    assert.ok(checkInNudge([member()], { 'mem-1': ago(3) }, NOW));
  });

  it('never nudges about another caregiver', () => {
    // He can pick up a phone himself.
    const brother = member({ id: 'mem-2', name: 'Bhaiya', role: 'caregiver' });
    assert.equal(checkInNudge([brother], {}, NOW), null);
  });

  it('ranks someone never called above everyone else', () => {
    const nudge = checkInNudge(
      [member(), member({ id: 'mem-2', name: 'Papa' })],
      { 'mem-1': ago(30) },
      NOW,
    );

    assert.ok(nudge);
    assert.equal(nudge.name, 'Papa');
    assert.equal(nudge.days, null);
  });

  it('picks the longest gap when everyone has been called', () => {
    const nudge = checkInNudge(
      [member(), member({ id: 'mem-2', name: 'Papa' })],
      { 'mem-1': ago(4), 'mem-2': ago(11) },
      NOW,
    );

    assert.ok(nudge);
    assert.equal(nudge.name, 'Papa');
    assert.equal(nudge.days, 11);
  });

  it('returns only one person, however many are overdue', () => {
    const nudge = checkInNudge(
      [member(), member({ id: 'mem-2', name: 'Papa' }), member({ id: 'mem-3', name: 'Nani' })],
      {},
      NOW,
    );

    // A list of everyone you have neglected is a guilt trip, and a guilt trip
    // gets the notifications switched off.
    assert.ok(nudge);
    assert.equal(typeof nudge.name, 'string');
  });
});

describe('checkInSentence', () => {
  it('never scolds', () => {
    for (const days of [null, 1, 5, 40]) {
      const sentence = checkInSentence({ memberId: 'mem-1', name: 'Ammi', days });
      for (const word of ['should', 'forgot', 'neglect', 'failed', "haven't bothered"]) {
        assert.ok(!sentence.toLowerCase().includes(word), `"${word}" in: ${sentence}`);
      }
    }
  });

  it('reads naturally at one day and at none', () => {
    assert.equal(
      checkInSentence({ memberId: 'mem-1', name: 'Ammi', days: 1 }),
      'It has been a day since you called Ammi.',
    );
    assert.equal(
      checkInSentence({ memberId: 'mem-1', name: 'Ammi', days: null }),
      'You have not called Ammi from this phone yet.',
    );
    assert.equal(
      checkInSentence({ memberId: 'mem-1', name: 'Ammi', days: 6 }),
      'It has been 6 days since you called Ammi.',
    );
  });
});

describe('recordCall', () => {
  it('round-trips and resets the nudge', async () => {
    assert.ok(checkInNudge([member()], await readCallLog(), NOW));

    await recordCall('mem-1', new Date(NOW));

    const log = await readCallLog();
    assert.equal(daysSinceCall(log, 'mem-1', NOW), 0);
    assert.equal(checkInNudge([member()], log, NOW), null);
  });

  it('keeps other members untouched', async () => {
    await recordCall('mem-1', new Date(NOW - 5 * DAY));
    await recordCall('mem-2', new Date(NOW));

    const log = await readCallLog();
    assert.equal(daysSinceCall(log, 'mem-1', NOW), 5);
    assert.equal(daysSinceCall(log, 'mem-2', NOW), 0);
  });
});
