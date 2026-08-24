/** Loading and refreshing the family's day. */

import { friendlyError } from './errors';
import { supabase } from './supabase';
import type { DoseWindow, Medication, Member } from './types';

export type FamilySnapshot = {
  members: Member[];
  medications: Medication[];
  /** Today's windows, for every member in the family. */
  windows: DoseWindow[];
};

const dayBounds = (date = new Date()) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

/** The date to hand `ensure_dose_windows`, as a plain YYYY-MM-DD. */
const localDate = (date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Windows are generated lazily on app open — there is no cron and no pg_cron.
 * Call this on foreground and on pull-to-refresh, then mark anything that has
 * gone past its grace period.
 */
/**
 * Returns an error message rather than throwing, so a screen can show it.
 * Never swallow this: if window generation fails, every screen silently looks
 * like "no medications yet" and there is nothing to debug from.
 */
export const ensureToday = async (familyId: string): Promise<string | null> => {
  const ensured = await supabase.rpc('ensure_dose_windows', {
    p_family_id: familyId,
    p_date: localDate(),
  });
  if (ensured.error) return friendlyError(ensured.error);

  const marked = await supabase.rpc('mark_stale_unconfirmed', { p_family_id: familyId });
  if (marked.error) return friendlyError(marked.error);

  return null;
};

export const loadFamilyToday = async (familyId: string): Promise<FamilySnapshot> => {
  const { start, end } = dayBounds();

  const [membersResult, windowsResult] = await Promise.all([
    supabase.from('members').select('*').eq('family_id', familyId).order('created_at'),
    supabase
      .from('dose_windows')
      .select('*')
      .eq('family_id', familyId)
      .gte('scheduled_at', start)
      .lt('scheduled_at', end)
      .order('scheduled_at'),
  ]);

  const members = (membersResult.data ?? []) as Member[];

  const { data: medicationRows } = await supabase
    .from('medications')
    .select('*')
    .in('member_id', members.length > 0 ? members.map((m) => m.id) : ['00000000-0000-0000-0000-000000000000'])
    .eq('active', true)
    .order('created_at');

  return {
    members,
    medications: (medicationRows ?? []) as Medication[],
    windows: (windowsResult.data ?? []) as DoseWindow[],
  };
};

/** Every window for one member over the last N days — drift and the grid. */
export const loadMemberHistory = async (
  memberId: string,
  days = 21,
): Promise<{ medications: Medication[]; windows: DoseWindow[] }> => {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [medicationsResult, windowsResult] = await Promise.all([
    supabase.from('medications').select('*').eq('member_id', memberId).order('created_at'),
    supabase
      .from('dose_windows')
      .select('*')
      .eq('member_id', memberId)
      .gte('scheduled_at', since.toISOString())
      .order('scheduled_at'),
  ]);

  return {
    medications: (medicationsResult.data ?? []) as Medication[],
    windows: (windowsResult.data ?? []) as DoseWindow[],
  };
};
