-- 006_fix_window_generation.sql
--
-- Fixes generate_windows_for_member, which threw on every call, so no dose
-- window was ever created for a family added through the app. The seeded
-- family looked fine because seed.sql builds its own timestamps from a real
-- `date` loop variable.
--
-- The bug: generate_series(date, date, interval) returns TIMESTAMP, not date.
-- So `d::text` was '2026-08-22 00:00:00', and
--   ('2026-08-22 00:00:00' || ' ' || '08:00:00')::timestamp
-- is not a valid timestamp.
--
-- The fix: stop doing date arithmetic through text. `date + time` is already
-- a timestamp in Postgres, so add them directly and let the member's timezone
-- turn it into an instant.

create or replace function generate_windows_for_member(
  p_member_id uuid,
  p_from date,
  p_to date
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into dose_windows (medication_id, member_id, family_id, scheduled_at, state)
  select
    med.id,
    mem.id,
    mem.family_id,
    ((g.day::date + t) at time zone mem.timezone),
    'pending'::dose_state
  from members mem
  join medications med on med.member_id = mem.id and med.active
  cross join lateral unnest(med.times) as t
  cross join lateral generate_series(p_from, p_to, interval '1 day') as g(day)
  where mem.id = p_member_id
  on conflict (medication_id, scheduled_at) do nothing;
$$;
