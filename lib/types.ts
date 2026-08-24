/** Row shapes mirroring supabase/migrations. Keep in step with the SQL. */

export type MemberRole = 'caregiver' | 'care_recipient';

/**
 * `unconfirmed` is not "missed". We never assert a dose was missed — we say
 * there is no confirmation and hand it to a human. That distinction is the
 * product.
 */
export type DoseState =
  | 'pending'
  | 'confirmed'
  | 'unconfirmed'
  | 'resolved_taken'
  | 'resolved_missed'
  | 'resolved_unreachable';

/** The three states a caregiver can close an unconfirmed dose into. */
export type ResolutionState = Extract<
  DoseState,
  'resolved_taken' | 'resolved_missed' | 'resolved_unreachable'
>;

export type LogSource = 'nfc' | 'qr' | 'button' | 'notification' | 'caregiver';

export type ResolveOutcome =
  | 'confirmed'
  | 'already_confirmed'
  | 'extra'
  | 'unknown_token';

export type Family = {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
};

/** `user_id` is nullable by design: a care recipient may never have an email
 *  of their own. The caregiver creates the profile and it is claimed later. */
export type Member = {
  id: string;
  family_id: string;
  user_id: string | null;
  name: string;
  role: MemberRole;
  phone: string | null;
  timezone: string;
  created_at: string;
};

export type Medication = {
  id: string;
  member_id: string;
  name: string;
  dose_text: string | null;
  /** 'HH:MM:SS' strings as Postgres returns a time[]. */
  times: string[];
  quantity_remaining: number | null;
  units_per_dose: number;
  active: boolean;
  created_at: string;
};

export type DoseWindow = {
  id: string;
  medication_id: string;
  member_id: string;
  family_id: string;
  scheduled_at: string;
  state: DoseState;
  confirmed_at: string | null;
  source: LogSource | null;
  resolved_by: string | null;
  resolved_at: string | null;
  is_extra: boolean;
};

export type Tag = {
  id: string;
  token: string;
  member_id: string;
  medication_id: string | null;
  label: string | null;
  created_at: string;
};

export type EmergencyInfo = {
  member_id: string;
  blood_group: string | null;
  allergies: string[] | null;
  conditions: string[] | null;
  insurance_note: string | null;
  updated_at: string;
};

/** What `resolve_tag` returns. */
export type ResolveTagResult = {
  outcome: ResolveOutcome;
  dose_window_id: string | null;
  medication_name: string | null;
  member_name: string | null;
  scheduled_at: string | null;
  confirmed_at: string | null;
};
