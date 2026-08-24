-- 008_refills.sql
--
-- quantity_remaining only ever counted down, so refill runway reached zero and
-- stayed there. Every confirmed dose decrements it and nothing ever put stock
-- back — which makes the runway number useless after the first box runs out.
--
-- An RPC rather than a client-side update so the increment is read-modify-write
-- free: two caregivers recording the same refill cannot clobber each other.

create or replace function record_refill(p_medication_id uuid, p_units int)
returns medications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_med medications%rowtype;
begin
  if p_units is null or p_units <= 0 then
    raise exception 'Enter how many were added.';
  end if;

  select * into v_med from medications where id = p_medication_id;

  if not found then
    raise exception 'No such medication.';
  end if;

  if not can_touch_member(v_med.member_id) then
    raise exception 'Not a member of this family.';
  end if;

  update medications
     set quantity_remaining = coalesce(quantity_remaining, 0) + p_units
   where id = p_medication_id
  returning * into v_med;

  return v_med;
end;
$$;
