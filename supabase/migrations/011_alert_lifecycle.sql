-- 011_alert_lifecycle.sql
--
-- Two flaws in the alert queue from 009, both found by actually running it.
--
-- 1. An alert with no registered caregiver device was marked sent so it would
--    not block the queue — which meant it was never delivered, even once a
--    caregiver registered a minute later. A family that installs the app
--    before enabling notifications would silently lose every early alert.
--    Fixing this needs created_at in the payload so the sender can tell a
--    fresh alert (wait, a device may appear) from a stale one (give up).
--
-- 2. An alert whose dose was resolved by a caregiver stayed pending forever:
--    pending_alerts filters on state = 'unconfirmed', so a resolved dose fell
--    out of the result set without ever being closed. Harmless but it grows a
--    table of rows nothing will ever action.

-- Adding created_at changes the OUT parameter set, and `create or replace`
-- cannot do that — Postgres requires the old signature be dropped first.
drop function if exists pending_alerts(int);

create or replace function pending_alerts(p_limit int default 50)
returns table (
  alert_id        uuid,
  dose_window_id  uuid,
  member_name     text,
  medication_name text,
  scheduled_at    timestamptz,
  created_at      timestamptz,
  push_tokens     text[]
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    w.id,
    subject.name,
    med.name,
    w.scheduled_at,
    a.created_at,
    coalesce(
      array_agg(distinct d.push_token) filter (where d.push_token is not null),
      '{}'
    )
  from unconfirmed_alerts a
  join dose_windows w on w.id = a.dose_window_id
  join members subject on subject.id = w.member_id
  join medications med on med.id = w.medication_id
  -- Tell the caregivers, never the person who already forgot.
  left join members caregiver
    on caregiver.family_id = w.family_id and caregiver.role = 'caregiver'
  left join devices d on d.member_id = caregiver.id
  where a.sent_at is null
    and w.state = 'unconfirmed'
  group by a.id, w.id, subject.name, med.name, w.scheduled_at, a.created_at
  order by w.scheduled_at
  limit p_limit;
$$;

create or replace function sweep_unconfirmed()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new int;
begin
  update dose_windows
     set state = 'unconfirmed'
   where state = 'pending'
     and scheduled_at < now() - interval '60 minutes';

  -- Close out alerts whose dose is no longer unconfirmed: a caregiver got
  -- there first, or she tapped late. Nothing left to tell anyone.
  update unconfirmed_alerts a
     set sent_at = now()
    from dose_windows w
   where w.id = a.dose_window_id
     and a.sent_at is null
     and w.state <> 'unconfirmed';

  with fresh as (
    insert into unconfirmed_alerts (dose_window_id, family_id)
    select w.id, w.family_id
    from dose_windows w
    where w.state = 'unconfirmed'
      and w.scheduled_at > now() - interval '24 hours'
    on conflict (dose_window_id) do nothing
    returning 1
  )
  select count(*) into v_new from fresh;

  return v_new;
end;
$$;

revoke execute on function sweep_unconfirmed() from anon, authenticated;
revoke execute on function pending_alerts(int) from anon, authenticated;
