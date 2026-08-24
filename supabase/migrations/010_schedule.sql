-- 010_schedule.sql
--
-- Runs the notify function every 15 minutes.
--
-- Note this reverses an earlier decision: CLAUDE.md says "do not add pg_cron",
-- and for the hackathon build that was right — dose windows were generated
-- lazily on app open and there was nothing to schedule. Once caregivers are
-- meant to be told about an unconfirmed dose WITHOUT opening the app, a
-- scheduler stops being optional. Lazy generation on foreground still stands;
-- this is only the alert sweep.
--
-- Before running this, in the Supabase dashboard:
--
--   1. Database → Extensions → enable `pg_cron` and `pg_net`
--   2. Edge Functions → Secrets → add NOTIFY_SECRET = <a long random string>
--   3. Deploy the function: supabase functions deploy notify
--      (leave JWT verification ON — see the header of functions/notify)
--
-- Then run the statement below with three substitutions:
--   <ANON-KEY>       the app's anon key, which is a JWT and satisfies
--                    Supabase's verify_jwt. It is public by design; the
--                    NOTIFY_SECRET below is what actually protects the
--                    endpoint. The new-style `sb_secret_...` keys cannot be
--                    used here — they are not JWTs, so verify_jwt rejects
--                    them with UNAUTHORIZED_INVALID_JWT_FORMAT.
--   <NOTIFY-SECRET>  the same value set in step 2.
--
-- Run this by hand in the SQL editor. Do not commit the filled-in version:
-- cron job bodies are stored in plaintext in cron.job, so treat this as a
-- credential either way.

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
        'Content-Type',       'application/json',
        'Authorization',      'Bearer <ANON-KEY>',
        'x-khairiyat-secret', '<NOTIFY-SECRET>'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- Sanity checks:
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content
--     from net._http_response order by created desc limit 1;
