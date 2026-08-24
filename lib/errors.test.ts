/**
 * Run: npm test
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { friendlyError } from './errors.ts';

describe('friendlyError', () => {
  it('passes our own RPC copy through untouched', () => {
    // Every one of these is a `raise exception` we wrote. They are already the
    // sentence we want on screen.
    for (const message of [
      'Sign in first.',
      'That code does not match that name.',
      'Someone has already claimed that name.',
      'Not a member of this family.',
      'No such dose.',
      'Too many taps we could not recognise. Give it a minute and try again.',
      'That is a lot of families for one day. Try again tomorrow.',
    ]) {
      assert.equal(friendlyError({ message }), message);
    }
  });

  it('never shows a constraint name to a caregiver', () => {
    const result = friendlyError({
      message: 'duplicate key value violates unique constraint "members_pkey"',
    });

    assert.equal(result, 'That one is already saved.');
    assert.ok(!result.includes('members_pkey'));
  });

  it('replaces the rest of the Postgres vocabulary', () => {
    for (const message of [
      'null value in column "name" violates not-null constraint',
      'permission denied for table dose_windows',
      'JSON object requested, multiple (or no) rows returned',
      'relation "medications" does not exist',
      'invalid input syntax for type uuid: "abc"',
    ]) {
      const result = friendlyError({ message });
      assert.notEqual(result, message, `leaked: ${message}`);
      assert.ok(result.length > 0);
    }
  });

  it('tells someone offline that nothing was lost', () => {
    // The tap queue means this is true. Saying "try again" would be a lie that
    // makes people tap twice.
    assert.match(friendlyError({ message: 'Network request failed' }), /back online/);
  });

  it('names the two sign-in mistakes people actually make', () => {
    assert.match(friendlyError({ message: 'Invalid login credentials' }), /do not match/);
    assert.match(friendlyError({ message: 'User already registered' }), /Sign in instead/);
  });

  it('falls back rather than showing nothing at all', () => {
    assert.equal(friendlyError(null), 'That did not save. Try once more.');
    assert.equal(friendlyError(undefined), 'That did not save. Try once more.');
    assert.equal(friendlyError({}), 'That did not save. Try once more.');
    assert.equal(friendlyError({ message: '   ' }), 'That did not save. Try once more.');
  });

  it('does not mistake a long machine sentence for our own copy', () => {
    // Ends in a full stop and reads almost like prose, but it is Postgres.
    const message = 'new row for relation "members" violates check constraint "members_role_check".';
    assert.equal(friendlyError({ message }), 'That did not save. Try once more.');
  });
});
