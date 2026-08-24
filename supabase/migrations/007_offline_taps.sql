-- 007_offline_taps.sql
--
-- A tap with no network used to be lost outright: resolve_tag failed and the
-- dose was never recorded. That is the worst possible failure for the one
-- interaction the whole product is built on — she did take the pill, and the
-- family is told nothing.
--
-- The client now queues failed taps and replays them, which means the server
-- must be told WHEN the tap happened rather than assuming now(). Without this,
-- a dose taken at 08:05 and synced at 18:00 would land in the evening window,
-- or as an extra dose, and would poison the drift calculation.
--
-- p_at defaults to null, which means "right now" — so live taps are unchanged.
-- The old two-argument signature is dropped so PostgREST has no ambiguity.

drop function if exists resolve_tag(text, log_source);

create or replace function resolve_tag(
  p_token  text,
  p_source log_source,
  p_at     timestamptz default null
)
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
  v_at     timestamptz;
begin
  -- Never trust a device clock for a future time; a queued tap is always past.
  v_at := least(coalesce(p_at, now()), now());

  select * into v_tag from tags where token = p_token;
  if not found then
    return query select 'unknown_token'::resolve_outcome,
                        null::uuid, null::text, null::text,
                        null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_member from members where id = v_tag.member_id;

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

  v_today := (v_at at time zone v_member.timezone)::date;
  perform generate_windows_for_member(v_member.id, v_today - 1, v_today + 1);

  -- Nearest window to the moment of the TAP, not the moment of the sync.
  select * into v_win
  from dose_windows w
  where w.member_id = v_member.id
    and w.medication_id = v_med_id
    and w.scheduled_at between v_at - interval '120 minutes'
                           and v_at + interval '120 minutes'
    and w.state in ('pending', 'unconfirmed', 'confirmed')
  order by
    abs(extract(epoch from (w.scheduled_at - v_at))),
    case w.state
      when 'pending'     then 0
      when 'unconfirmed' then 1
      else 2
    end
  limit 1;

  if not found then
    insert into dose_windows (
      medication_id, member_id, family_id,
      scheduled_at, state, confirmed_at, source, is_extra
    )
    values (
      v_med_id, v_member.id, v_member.family_id,
      v_at, 'confirmed', v_at, p_source, true
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

  -- Double-tap protection, measured against the tap time.
  if v_win.state = 'confirmed'
     and v_win.confirmed_at is not null
     and v_win.confirmed_at > v_at - interval '10 minutes' then
    return query
      select 'already_confirmed'::resolve_outcome, v_win.id, med.name,
             v_member.name, v_win.scheduled_at, v_win.confirmed_at
      from medications med where med.id = v_med_id;
    return;
  end if;

  update dose_windows
     set state        = 'confirmed',
         confirmed_at = v_at,
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

-- Same treatment for the Simple Mode button, so a queued button press also
-- records the time it was actually pressed.
drop function if exists confirm_dose(uuid, log_source);

create or replace function confirm_dose(
  p_dose_window_id uuid,
  p_source         log_source,
  p_at             timestamptz default null
)
returns dose_windows
language plpgsql
security definer
set search_path = public
as $$
declare
  v_win dose_windows%rowtype;
  v_at  timestamptz;
begin
  v_at := least(coalesce(p_at, now()), now());

  select * into v_win from dose_windows where id = p_dose_window_id;

  if not found then
    raise exception 'No such dose.';
  end if;

  if not is_family_member(v_win.family_id) then
    raise exception 'Not a member of this family.';
  end if;

  if v_win.state = 'confirmed'
     and v_win.confirmed_at is not null
     and v_win.confirmed_at > v_at - interval '10 minutes' then
    return v_win;
  end if;

  update dose_windows
     set state        = 'confirmed',
         confirmed_at = v_at,
         source       = p_source
   where id = p_dose_window_id
  returning * into v_win;

  update medications
     set quantity_remaining = greatest(quantity_remaining - units_per_dose, 0)
   where id = v_win.medication_id and quantity_remaining is not null;

  return v_win;
end;
$$;
