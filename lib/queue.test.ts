/**
 * Run: npm test
 *
 * A tap is the one thing the product must never lose: she took the pill, and
 * whether the family ever learns that now depends entirely on this file. It is
 * also the hardest thing to test by hand — reproducing it means turning off
 * mobile data at the right second — which is exactly why it is worth testing
 * here instead.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

/* -------------------------------------------------------------------------- */
/* Stand-ins                                                                   */
/* -------------------------------------------------------------------------- */

const store = new Map<string, string>();

mock.module('@react-native-async-storage/async-storage', {
  defaultExport: {
    getItem: async (key: string): Promise<string | null> => store.get(key) ?? null,
    setItem: async (key: string, value: string): Promise<void> => {
      store.set(key, value);
    },
  },
});

type RpcCall = { name: string; args: Record<string, unknown> };

const calls: RpcCall[] = [];
/** Set to make the nth call (0-based) fail, as a dead network would. */
let failFrom = Infinity;

mock.module(new URL('./supabase.ts', import.meta.url).href, {
  namedExports: {
    supabase: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return calls.length - 1 >= failFrom
          ? { data: null, error: { message: 'network request failed' } }
          : { data: null, error: null };
      },
    },
  },
});

const { enqueue, flush, pendingCount } = await import('./queue.ts');

beforeEach(() => {
  store.clear();
  calls.length = 0;
  failFrom = Infinity;
});

const AT = '2026-08-23T08:05:00.000Z';

/** Indexed access that satisfies noUncheckedIndexedAccess without a `!`. */
const at = <T>(xs: readonly T[], index: number): T => {
  const value = xs[index];
  if (value === undefined) throw new Error(`expected an item at index ${index}`);
  return value;
};

/* -------------------------------------------------------------------------- */

describe('enqueue', () => {
  it('starts empty', async () => {
    assert.equal(await pendingCount(), 0);
  });

  it('keeps taps in the order they happened', async () => {
    await enqueue({ kind: 'tag', token: 'aaa', source: 'nfc', at: AT });
    await enqueue({ kind: 'dose', doseWindowId: 'win-1', source: 'button', at: AT });

    assert.equal(await pendingCount(), 2);

    await flush();
    assert.deepEqual(
      calls.map((c) => c.name),
      ['resolve_tag', 'confirm_dose'],
    );
  });

  it('survives the app being killed between the tap and the sync', async () => {
    await enqueue({ kind: 'tag', token: 'aaa', source: 'nfc', at: AT });

    // A cold start is a fresh module reading the same key off disk.
    const reloaded = await import('./queue.ts');
    assert.equal(await reloaded.pendingCount(), 1);
  });
});

describe('flush', () => {
  it('does nothing and calls nothing when the queue is empty', async () => {
    assert.equal(await flush(), 0);
    assert.equal(calls.length, 0);
  });

  it('sends the time of the TAP, not the time of the sync', async () => {
    await enqueue({ kind: 'tag', token: 'aaa', source: 'nfc', at: AT });
    await flush();

    // Without p_at the server would file an 08:05 dose against whatever window
    // is open when the phone finds signal again — possibly the evening one.
    assert.deepEqual(at(calls, 0).args, { p_token: 'aaa', p_source: 'nfc', p_at: AT });
  });

  it('passes a queued Simple Mode press through with its own timestamp', async () => {
    await enqueue({ kind: 'dose', doseWindowId: 'win-1', source: 'button', at: AT });
    await flush();

    assert.deepEqual(at(calls, 0).args, {
      p_dose_window_id: 'win-1',
      p_source: 'button',
      p_at: AT,
    });
  });

  it('empties the queue once everything lands', async () => {
    await enqueue({ kind: 'tag', token: 'aaa', source: 'nfc', at: AT });
    await enqueue({ kind: 'tag', token: 'bbb', source: 'qr', at: AT });

    assert.equal(await flush(), 2);
    assert.equal(await pendingCount(), 0);
  });

  it('stops at the first failure and keeps that tap and everything behind it', async () => {
    await enqueue({ kind: 'tag', token: 'aaa', source: 'nfc', at: AT });
    await enqueue({ kind: 'tag', token: 'bbb', source: 'nfc', at: AT });
    await enqueue({ kind: 'tag', token: 'ccc', source: 'nfc', at: AT });

    failFrom = 1;

    assert.equal(await flush(), 1);
    // Ordering is the point: replaying 'ccc' before 'bbb' would confirm the
    // wrong window if both fall near the same dose.
    assert.equal(await pendingCount(), 2);
    assert.equal(calls.length, 2, 'stops rather than hammering a dead connection');
  });

  it('resumes from where it stopped on the next attempt', async () => {
    await enqueue({ kind: 'tag', token: 'aaa', source: 'nfc', at: AT });
    await enqueue({ kind: 'tag', token: 'bbb', source: 'nfc', at: AT });

    failFrom = 1;
    await flush();

    failFrom = Infinity;
    calls.length = 0;

    assert.equal(await flush(), 1);
    assert.equal(at(calls, 0).args.p_token, 'bbb', 'the tap that failed is retried, not skipped');
    assert.equal(await pendingCount(), 0);
  });

  it('treats an unrecognised tag as delivered, not as a failure', async () => {
    // resolve_tag reports 'unknown_token' as DATA with no error, so the tap is
    // considered handled and leaves the queue. It must not wedge everything
    // behind it forever.
    await enqueue({ kind: 'tag', token: 'not-a-real-token', source: 'nfc', at: AT });
    await enqueue({ kind: 'tag', token: 'bbb', source: 'nfc', at: AT });

    assert.equal(await flush(), 2);
    assert.equal(await pendingCount(), 0);
  });
});
