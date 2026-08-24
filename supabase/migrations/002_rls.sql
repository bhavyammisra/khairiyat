-- 002_rls.sql — row level security
--
-- The whole policy set rests on one helper. Everything a member can see is
-- reachable from their family_id.
--
-- Two flows deliberately cannot work under these policies and are handled by
-- security definer RPCs in 003 instead of by loosening anything here:
--   * creating a family — you are not a member of it until the member row
--     exists, and the member row needs the family to exist first
--   * joining a family — you are not a member yet, by definition

create or replace function is_family_member(fid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from members
    where family_id = fid and user_id = auth.uid()
  );
$$;

-- Same question, asked about a member row rather than a family.
create or replace function can_touch_member(mid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from members target
    join members me on me.family_id = target.family_id
    where target.id = mid and me.user_id = auth.uid()
  );
$$;

alter table families       enable row level security;
alter table members        enable row level security;
alter table medications    enable row level security;
alter table dose_windows   enable row level security;
alter table tags           enable row level security;
alter table emergency_info enable row level security;

-- families ------------------------------------------------------------------

create policy families_select on families
  for select using (is_family_member(id));

create policy families_update on families
  for update using (is_family_member(id));

-- members -------------------------------------------------------------------

create policy members_select on members
  for select using (is_family_member(family_id));

create policy members_insert on members
  for insert with check (is_family_member(family_id));

create policy members_update on members
  for update using (is_family_member(family_id));

create policy members_delete on members
  for delete using (is_family_member(family_id));

-- medications ---------------------------------------------------------------

create policy medications_select on medications
  for select using (can_touch_member(member_id));

create policy medications_insert on medications
  for insert with check (can_touch_member(member_id));

create policy medications_update on medications
  for update using (can_touch_member(member_id));

create policy medications_delete on medications
  for delete using (can_touch_member(member_id));

-- dose_windows --------------------------------------------------------------
-- No insert policy: windows are only ever created by the security definer
-- RPCs. A client inserting its own dose window is not a flow we have.

create policy dose_windows_select on dose_windows
  for select using (is_family_member(family_id));

create policy dose_windows_update on dose_windows
  for update using (is_family_member(family_id));

-- tags ----------------------------------------------------------------------

create policy tags_select on tags
  for select using (can_touch_member(member_id));

create policy tags_insert on tags
  for insert with check (can_touch_member(member_id));

create policy tags_update on tags
  for update using (can_touch_member(member_id));

create policy tags_delete on tags
  for delete using (can_touch_member(member_id));

-- emergency_info ------------------------------------------------------------

create policy emergency_info_select on emergency_info
  for select using (can_touch_member(member_id));

create policy emergency_info_insert on emergency_info
  for insert with check (can_touch_member(member_id));

create policy emergency_info_update on emergency_info
  for update using (can_touch_member(member_id));
