-- 009_push_alerts.sql
--
-- The gap this closes is the biggest one in the product.
--
-- Until now `mark_stale_unconfirmed` only ran when somebody opened the app, so
-- a caregiver only learned a dose went unconfirmed if they happened to look.
-- The pitch is that the family is the intervention — but the family had to go
-- looking. This makes the app reach out.
--
-- Two pieces:
--   1. devices: Expo push tokens per member, so we know where to send.
--   2. unconfirmed_alerts: a queue of alerts a scheduled job drains.
--
-- The sender itself is a Supabase Edge Function (supabase/functions/notify)
-- driven by pg_cron or an external scheduler. Deliberately NOT pg_net from a
-- trigger: a failed HTTP call must not roll back the dose state.

create table if not exists devices (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references members(id) on delete cascade,
  -- ExponentPushToken[...]
  push_token   text not null,
  platform     text,
  updated_at   timestamptz not null default now(),
  unique (member_id, push_token)
);

create index if not exists devices_member_idx on devices (member_id);

alter table devices enable row level security;

create policy devices_select on devices
  for select using (can_touch_member(member_id));

create policy devices_insert on devices
  for insert with check (can_touch_member(member_id));

create policy devices_update on devices
  for update using (can_touch_member(member_id));

create policy devices_delete on devices
  for delete using (can_touch_member(member_id));

-- One row per alert we still owe someone.
create table if not exists unconfirmed_alerts (
  id             uuid primary key default gen_random_uuid(),
  dose_window_id uuid not null references dose_windows(id) on delete cascade,
  family_id      uuid not null references families(id) on delete cascade,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  -- Never alert twice for the same dose, however often the job runs.
  unique (dose_window_id)
);

create index if not exists unconfirmed_alerts_pending_idx
  on unconfirmed_alerts (created_at)
  where sent_at is null;

alter table unconfirmed_alerts enable row level security;

create policy unconfirmed_alerts_select on unconfirmed_alerts
  for select using (is_family_member(family_id));

-- Register this device against the signed-in person's member row.
create or replace function register_device(p_push_token text, p_platform text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  select id into v_member from members where user_id = auth.uid() limit 1;

  if v_member is null then
    return; -- Not part of a family yet; nothing to attach the token to.
  end if;

  insert into devices (member_id, push_token, platform)
  values (v_member, p_push_token, p_platform)
  on conflict (member_id, push_token)
  do update set updated_at = now(), platform = excluded.platform;
end;
$$;

/**
 * Sweeps EVERY family, not just one that happens to be open.
 *
 * This is the function the scheduler calls. It marks stale windows and records
 * an alert for each newly unconfirmed dose. Returns the number of new alerts so
 * the job has something to log.
 */
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

-- What the sender needs, in one query: who to tell, and what to say.
create or replace function pending_alerts(p_limit int default 50)
returns table (
  alert_id        uuid,
  dose_window_id  uuid,
  member_name     text,
  medication_name text,
  scheduled_at    timestamptz,
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
  group by a.id, w.id, subject.name, med.name, w.scheduled_at
  order by w.scheduled_at
  limit p_limit;
$$;

create or replace function mark_alert_sent(p_alert_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update unconfirmed_alerts set sent_at = now() where id = p_alert_id;
$$;

-- These two are for the scheduled job only, never the app.
revoke execute on function sweep_unconfirmed() from anon, authenticated;
revoke execute on function pending_alerts(int) from anon, authenticated;
revoke execute on function mark_alert_sent(uuid) from anon, authenticated;
