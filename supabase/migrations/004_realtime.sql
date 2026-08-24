-- 004_realtime.sql
--
-- The dashboard subscribes to dose_windows filtered on family_id. A ring
-- filling on the caregiver's phone while nobody touched it is the demo, so if
-- the dashboard does not live-update, check this ran before debugging the
-- client.
--
-- Nothing else in the app needs realtime.

alter publication supabase_realtime add table dose_windows;

-- Realtime sends old-row data on update only when the replica identity is
-- full. Without this, an update payload arrives with nulls for unchanged
-- columns.
alter table dose_windows replica identity full;
