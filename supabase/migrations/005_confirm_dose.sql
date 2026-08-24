-- 005_confirm_dose.sql
--
-- The floor of the input degradation stack: the big button in Simple Mode,
-- which always works even with no NFC and no camera.
--
-- This exists rather than a plain update from the client so that confirmed_at
-- comes from the server clock, the double-tap rule is applied in one place,
-- and the medication stock draws down — exactly as resolve_tag does.

create or replace function confirm_dose(p_dose_window_id uuid, p_source log_source)
returns dose_windows
language plpgsql
security definer
set search_path = public
as $$
declare
  v_win dose_windows%rowtype;
begin
  select * into v_win from dose_windows where id = p_dose_window_id;

  if not found then
    raise exception 'No such dose.';
  end if;

  if not is_family_member(v_win.family_id) then
    raise exception 'Not a member of this family.';
  end if;

  -- Double tap inside 10 minutes changes nothing, silently.
  if v_win.state = 'confirmed'
     and v_win.confirmed_at is not null
     and v_win.confirmed_at > now() - interval '10 minutes' then
    return v_win;
  end if;

  update dose_windows
     set state        = 'confirmed',
         confirmed_at = now(),
         source       = p_source
   where id = p_dose_window_id
  returning * into v_win;

  update medications
     set quantity_remaining = greatest(quantity_remaining - units_per_dose, 0)
   where id = v_win.medication_id and quantity_remaining is not null;

  return v_win;
end;
$$;
