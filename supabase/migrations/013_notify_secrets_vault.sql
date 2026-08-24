-- 013_notify_secrets_vault.sql
--
-- 010 scheduled the notify sweep with the anon key and the notify secret written
-- as literals into the cron job body. That body is stored in plaintext in
-- cron.job, readable by anyone who can read that table, and it leaks into
-- `pg_dump`, into a support bundle, and onto the screen the moment anyone runs
-- `select * from cron.job` while a projector is on.
--
-- Supabase Vault stores the values encrypted and exposes them through the
-- `vault.decrypted_secrets` view. The cron body then contains only the NAME of
-- each secret, which is not a credential. Rotating either one afterwards is an
-- update to the vault row — the schedule never has to be touched again.
--
-- 010 is already applied, so it is left alone. This supersedes it.

/* -------------------------------------------------------------------------- */
/* Step 1 — store the secrets. Run this part by hand.                          */
/* -------------------------------------------------------------------------- */

-- Substitute both values, run it, and DO NOT commit the filled-in version.
--
--   <ANON-KEY>      the app's anon key. It must be the legacy JWT-shaped key:
--                   Supabase's verify_jwt rejects the newer `sb_secret_...`
--                   format with UNAUTHORIZED_INVALID_JWT_FORMAT. It is public
--                   by design — NOTIFY_SECRET is what actually guards the
--                   endpoint — but there is no reason to leave it lying around
--                   in a job body either.
--   <NOTIFY-SECRET> the same string set as NOTIFY_SECRET in
--                   Edge Functions → Secrets.
--
-- `vault.create_secret` RAISES on a name that already exists — it does not
-- update in place. Re-running it after a half-finished attempt fails with
-- `duplicate key value violates unique constraint "secrets_name_idx"`, which
-- is a confusing thing to meet an hour before a demo. So this is written as an
-- upsert, and is safe to run as many times as you like.

-- do $$
-- declare
--   v_id uuid;
-- begin
--   select id into v_id from vault.secrets where name = 'khairiyat_anon_key';
--   if v_id is null then
--     perform vault.create_secret(
--       '<ANON-KEY>',
--       'khairiyat_anon_key',
--       'Anon JWT the notify cron job sends as its Authorization bearer.'
--     );
--   else
--     perform vault.update_secret(v_id, '<ANON-KEY>');
--   end if;
--
--   select id into v_id from vault.secrets where name = 'khairiyat_notify_secret';
--   if v_id is null then
--     perform vault.create_secret(
--       '<NOTIFY-SECRET>',
--       'khairiyat_notify_secret',
--       'Shared secret the notify edge function checks on x-khairiyat-secret.'
--     );
--   else
--     perform vault.update_secret(v_id, '<NOTIFY-SECRET>');
--   end if;
-- end;
-- $$;

-- Rotating either one later is the same block with a new value.

/* -------------------------------------------------------------------------- */
/* Step 2 — reschedule reading from the vault. Safe to commit and re-run.      */
/* -------------------------------------------------------------------------- */

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('khairiyat-notify')
where exists (select 1 from cron.job where jobname = 'khairiyat-notify');

select cron.schedule(
  'khairiyat-notify',
  '*/15 * * * *',
  $$
    select net.http_post(
      url     := 'https://ryewbhijcrhecveoriic.supabase.co/functions/v1/notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization',
          'Bearer ' || (select decrypted_secret
                          from vault.decrypted_secrets
                         where name = 'khairiyat_anon_key'),
        'x-khairiyat-secret',
          (select decrypted_secret
             from vault.decrypted_secrets
            where name = 'khairiyat_notify_secret')
      ),
      body    := '{}'::jsonb
    );
  $$
);

/* -------------------------------------------------------------------------- */
/* Checks                                                                      */
/* -------------------------------------------------------------------------- */

-- The job body should now show two secret NAMES and no key material:
--   select jobname, schedule, active, command from cron.job;
--
-- Both secrets present, without printing them:
--   select name, created_at from vault.secrets
--    where name like 'khairiyat_%';
--
-- The sweep is landing (expect status_code 200 within 15 minutes):
--   select status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content
--     from net._http_response order by created desc limit 1;
--
-- A 401 here means the anon key in the vault is not the JWT-shaped one.
-- A 403 means x-khairiyat-secret does not match the edge function's
-- NOTIFY_SECRET — check for a trailing newline in the vault value.
