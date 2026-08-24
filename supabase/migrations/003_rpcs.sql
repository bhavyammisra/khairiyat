-- 003_rpcs.sql — the functions the client actually calls
--
-- There is no cron and no pg_cron. Dose windows are generated lazily on app
-- open. Do not add a scheduler.

-- Outcome of a tap, so the client can pick the right full-screen state
-- without re-deriving it.
create type resolve_outcome as enum (
  'confirmed',         -- a dose window was just confirmed
  'already_confirmed', -- double tap inside 10 minutes; nothing changed
  'extra',             -- no window in range; logged as an extra dose
  'unknown_token'      -- no such tag
);

-- Dose window boundaries are computed from the server clock, never from the
-- device clock alone — a phone with a wrong time must not be able to confirm a
-- dose into the wrong window. The client syncs an offset from this on start.
create or replace function server_now()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

-- Internal: build the missing windows for one member over a date range,
-- interpreting each scheduled time in THAT MEMBER'S timezone. Not the device's
-- clock, not UTC. No permission check — callers do that.
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
    ((d::text || ' ' || t::text)::timestamp at time zone mem.timezone),
    'pending'::dose_state
  from members mem
  join medications med on med.member_id = mem.id and med.active
  cross join lateral unnest(med.times) as t
  cross join lateral generate_series(p_from, p_to, interval '1 day') as d
  where mem.id = p_member_id
  on conflict (medication_id, scheduled_at) do nothing;
$$;

-- Called by the client on app foreground and on pull-to-refresh.
create or replace function ensure_dose_windows(p_family_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member uuid;
begin
  if not is_family_member(p_family_id) then
    raise exception 'Not a member of this family.';
  end if;

  -- Yesterday through tomorrow, so a dose scheduled either side of midnight in
  -- the member's own timezone is always present.
  for v_member in select id from members where family_id = p_family_id loop
    perform generate_windows_for_member(v_member, p_date - 1, p_date + 1);
  end loop;
end;
$$;

-- Called immediately after ensure_dose_windows.
-- Note the wording: 'unconfirmed', never 'missed'. We do not know she missed
-- it. A caregiver resolves it after a phone call.
create or replace function mark_stale_unconfirmed(p_family_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_family_member(p_family_id) then
    raise exception 'Not a member of this family.';
  end if;

  update dose_windows
     set state = 'unconfirmed'
   where family_id = p_family_id
     and state = 'pending'
     and scheduled_at < now() - interval '60 minutes';
end;
$$;

-- The hero path. NFC tap, QR scan and the Simple Mode button all land here.
create or replace function resolve_tag(p_token text, p_source log_source)
returns table (
  outcome         resolve_outcome,
  dose_window_id  uuid,
  medication_name text,
  member_name     text,
  scheduled_at    timestamptz,
  confirmed_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag    tags%rowtype;
  v_member members%rowtype;
  v_med_id uuid;
  v_win    dose_windows%rowtype;
  v_today  date;
begin
  -- 1. Look up the tag.
  select * into v_tag from tags where token = p_token;
  if not found then
    return query select 'unknown_token'::resolve_outcome,
                        null::uuid, null::text, null::text,
                        null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_member from members where id = v_tag.member_id;

  -- A tag may be bound to a medication, or to "any due dose" for the member.
  v_med_id := v_tag.medication_id;
  if v_med_id is null then
    select id into v_med_id
    from medications
    where member_id = v_member.id and active
    order by created_at
    limit 1;
  end if;

  if v_med_id is null then
    return query select 'unknown_token'::resolve_outcome,
                        null::uuid, null::text, v_member.name,
                        null::timestamptz, null::timestamptz;
    return;
  end if;

  -- 2. Make sure today's windows exist for this member.
  v_today := (now() at time zone v_member.timezone)::date;
  perform generate_windows_for_member(v_member.id, v_today - 1, v_today + 1);

  -- 3. Nearest window within ±120 minutes. Nearest wins; where two are
  --    equally near, prefer pending, then unconfirmed, then confirmed.
  select * into v_win
  from dose_windows w
  where w.member_id = v_member.id
    and w.medication_id = v_med_id
    and w.scheduled_at between now() - interval '120 minutes'
                           and now() + interval '120 minutes'
    and w.state in ('pending', 'unconfirmed', 'confirmed')
  order by
    abs(extract(epoch from (w.scheduled_at - now()))),
    case w.state
      when 'pending'     then 0
      when 'unconfirmed' then 1
      else 2
    end
  limit 1;

  -- 6. Nothing in range: log it anyway rather than losing the tap, and flag it.
  if not found then
    insert into dose_windows (
      medication_id, member_id, family_id,
      scheduled_at, state, confirmed_at, source, is_extra
    )
    values (
      v_med_id, v_member.id, v_member.family_id,
      now(), 'confirmed', now(), p_source, true
    )
    returning * into v_win;

    update medications
       set quantity_remaining = greatest(quantity_remaining - units_per_dose, 0)
     where id = v_med_id and quantity_remaining is not null;

    return query
      select 'extra'::resolve_outcome, v_win.id, med.name, v_member.name,
             v_win.scheduled_at, v_win.confirmed_at
      from medications med where med.id = v_med_id;
    return;
  end if;

  -- 4. Double-tap protection: a second tap within 10 minutes changes nothing.
  if v_win.state = 'confirmed'
     and v_win.confirmed_at is not null
     and v_win.confirmed_at > now() - interval '10 minutes' then
    return query
      select 'already_confirmed'::resolve_outcome, v_win.id, med.name,
             v_member.name, v_win.scheduled_at, v_win.confirmed_at
      from medications med where med.id = v_med_id;
    return;
  end if;

  -- 5. Confirm it, and draw down the stock so refill runway stays honest.
  update dose_windows
     set state        = 'confirmed',
         confirmed_at = now(),
         source       = p_source
   where id = v_win.id
  returning * into v_win;

  update medications
     set quantity_remaining = greatest(quantity_remaining - units_per_dose, 0)
   where id = v_med_id and quantity_remaining is not null;

  return query
    select 'confirmed'::resolve_outcome, v_win.id, med.name, v_member.name,
           v_win.scheduled_at, v_win.confirmed_at
    from medications med where med.id = v_med_id;
end;
$$;

-- Creating a family. Security definer because you cannot be a member of a
-- family that does not exist yet, so RLS would block the member insert.
create or replace function create_family(p_family_name text, p_my_name text)
returns families
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family families%rowtype;
  v_code   text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  loop
    v_code := gen_join_code();
    exit when not exists (select 1 from families where join_code = v_code);
  end loop;

  insert into families (name, join_code)
  values (p_family_name, v_code)
  returning * into v_family;

  insert into members (family_id, user_id, name, role)
  values (v_family.id, auth.uid(), p_my_name, 'caregiver');

  return v_family;
end;
$$;

-- Joining. The user is not a member yet, so RLS cannot show them the member
-- list to pick their name from. Security definer, narrowly scoped: it returns
-- names of unclaimed profiles only, and only to someone holding the code.
create or replace function unclaimed_members(p_join_code text)
returns table (id uuid, name text, role member_role, family_name text)
language sql
security definer
set search_path = public
as $$
  select m.id, m.name, m.role, f.name
  from members m
  join families f on f.id = m.family_id
  where upper(f.join_code) = upper(trim(p_join_code))
    and m.user_id is null
  order by m.created_at;
$$;

create or replace function claim_member_profile(p_join_code text, p_member_id uuid)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  select m.* into v_member
  from members m
  join families f on f.id = m.family_id
  where m.id = p_member_id
    and upper(f.join_code) = upper(trim(p_join_code));

  if not found then
    raise exception 'That code does not match that name.';
  end if;

  if v_member.user_id is not null then
    raise exception 'Someone has already claimed that name.';
  end if;

  update members
     set user_id = auth.uid()
   where id = p_member_id
  returning * into v_member;

  return v_member;
end;
$$;

-- A caregiver closing out an unconfirmed dose after actually phoning her.
create or replace function resolve_dose(p_dose_window_id uuid, p_state dose_state)
returns dose_windows
language plpgsql
security definer
set search_path = public
as $$
declare
  v_win dose_windows%rowtype;
  v_me  uuid;
begin
  select * into v_win from dose_windows where id = p_dose_window_id;
  if not found then
    raise exception 'No such dose.';
  end if;

  if not is_family_member(v_win.family_id) then
    raise exception 'Not a member of this family.';
  end if;

  if p_state not in ('resolved_taken', 'resolved_missed', 'resolved_unreachable') then
    raise exception 'Not a resolution state.';
  end if;

  select id into v_me
  from members
  where family_id = v_win.family_id and user_id = auth.uid();

  update dose_windows
     set state       = p_state,
         resolved_by = v_me,
         resolved_at = now()
   where id = p_dose_window_id
  returning * into v_win;

  -- She did take it, so the stock went down even though she never tapped.
  if p_state = 'resolved_taken' then
    update medications
       set quantity_remaining = greatest(quantity_remaining - units_per_dose, 0)
     where id = v_win.medication_id and quantity_remaining is not null;
  end if;

  return v_win;
end;
$$;
