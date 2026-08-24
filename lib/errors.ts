/**
 * Turns whatever Supabase hands back into something a person can read.
 *
 * Screens used to render `error.message` straight out of PostgREST, which means
 * a family setting the app up for their mother could be shown
 * `duplicate key value violates unique constraint "members_pkey"`. Under a
 * ninety-day gathering ban nobody can lean over and fix it for her, so an error
 * she cannot act on is the end of the road, not a speed bump.
 *
 * The rule: anything we wrote ourselves is already warm and passes through
 * untouched; anything Postgres wrote gets replaced.
 */

type Unknown = { message?: unknown } | null | undefined;

/**
 * Substrings that mark a message as machine-authored. Postgres and PostgREST
 * both leak schema names, constraint names and error codes, none of which mean
 * anything to a caregiver.
 */
const MACHINE_MARKERS = [
  'violates',
  'duplicate key',
  'constraint',
  'relation ',
  'column ',
  'syntax error',
  'permission denied',
  'jwt',
  'pgrst',
  'json object requested',
  'function ',
  'invalid input',
  'null value',
  'row-level security',
  'failed to fetch',
  'network request failed',
];

/** Specific cases worth naming, checked before the generic fallback. */
const KNOWN: ReadonlyArray<readonly [string, string]> = [
  ['network request failed', 'No connection. This will send itself when you are back online.'],
  ['failed to fetch', 'No connection. This will send itself when you are back online.'],
  ['duplicate key', 'That one is already saved.'],
  ['row-level security', 'You do not have access to that family.'],
  ['permission denied', 'You do not have access to that family.'],
  ['jwt expired', 'You have been signed out. Sign in again to carry on.'],
  ['invalid login credentials', 'That email and password do not match.'],
  ['email not confirmed', 'Check your email for the confirmation link first.'],
  ['user already registered', 'There is already an account with that email. Sign in instead.'],
  ['password should be at least', 'Use a slightly longer password — at least six characters.'],
];

const FALLBACK = 'That did not save. Try once more.';

/**
 * True when the message reads like something we wrote in a `raise exception`.
 * Our copy is short, ends in a full stop, and never names a table.
 */
const isOurs = (message: string): boolean => {
  const lower = message.toLowerCase();
  if (MACHINE_MARKERS.some((marker) => lower.includes(marker))) return false;

  return message.length <= 120 && /[.!?]$/.test(message.trim());
};

export const friendlyError = (error: Unknown): string => {
  const raw = typeof error?.message === 'string' ? error.message.trim() : '';
  if (raw === '') return FALLBACK;

  const lower = raw.toLowerCase();

  for (const [marker, copy] of KNOWN) {
    if (lower.includes(marker)) return copy;
  }

  return isOurs(raw) ? raw : FALLBACK;
};
