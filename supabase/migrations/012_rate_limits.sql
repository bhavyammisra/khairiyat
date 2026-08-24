-- 012_rate_limits.sql
--
-- Four functions in this schema are `security definer` and callable by anyone
-- holding the anon key, which ships inside the APK and is public by design:
--
--   resolve_tag           — a token is the entire credential for confirming a dose
--   unclaimed_members     — a join code returns the family name and real people's names
--   claim_member_profile  — a join code plus a member id takes over that profile
--   create_family         — unbounded rows for one signed-in user
--
-- The first three are enumerable. Join codes are six characters from a 32-symbol
-- alphabet (001_schema) — roughly 1e9 combinations, which sounds like plenty until
-- you notice nothing stops a script trying them at a few thousand a second. The
-- prize for a hit is a family's name and the names of its unclaimed members, and
-- the same code is what claim_member_profile checks. That is the worst hole in
-- the schema, worse than tag guessing.
--
-- The fix is a rate limit that only ever counts FAILURES. A family tapping a real
-- sticker, or typing a code they were actually given, never accumulates a single
-- row here and can never be locked out of confirming a dose. Refusing a genuine
-- tap would be a worse bug than the attack this prevents.

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

create table if not exists rate_limit_events (
  id     bigserial primary key,
  bucket text        not null,
  key    text        not null,
  at     timestamptz not null default now()
);

create index if not exists rate_limit_events_lookup
  on rate_limit_events (bucket, key, at desc);

-- Every table in `public` is reachable through PostgREST. This one holds who
-- failed what and when, and nothing outside these functions has any business
-- reading or writing it. RLS with no policies denies both roles outright; the
-- security definer functions below run as the owner and bypass it.
alter table rate_limit_events enable row level security;
revoke all on table rate_limit_events from anon, authenticated;
revoke all on sequence rate_limit_events_id_seq from anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Who is calling                                                              */
/* -------------------------------------------------------------------------- */

-- PostgREST exposes the HTTP headers of the current request as a GUC, which is
-- the only way a Postgres function can see anything about the caller beyond
-- auth.uid() — and for `anon` there is no auth.uid().
--
-- Honest about the limits: `cf-connecting-ip` is written by Supabase's edge and
-- a client cannot forge it. `x-forwarded-for` can be forged at the left, so we
-- read it from the RIGHT, where the nearest trusted proxy appends. When neither
-- is present every caller shares one bucket, which degrades to a global limit
-- rather than to no limit at all.
create or replace function rl_client_key()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_headers json;
  v_ip      text;
  v_xff     text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;

  if v_headers is null then
    return 'unknown';
  end if;

  v_ip := nullif(btrim(coalesce(v_headers ->> 'cf-connecting-ip', '')), '');
  if v_ip is not null then
    return v_ip;
  end if;

  v_xff := coalesce(v_headers ->> 'x-forwarded-for', '');
  v_ip  := nullif(btrim(split_part(v_xff, ',', array_length(string_to_array(v_xff, ','), 1))), '');

  return coalesce(v_ip, 'unknown');
end;
$$;

/* -------------------------------------------------------------------------- */
/* The limiter                                                                 */
/* -------------------------------------------------------------------------- */

-- Raises when the caller is already over its allowance. Reads only; the caller
-- decides what counts as a failure worth recording.
create or replace function rl_check(
  p_bucket  text,
  p_key     text,
  p_limit   int,
  p_window  interval,
  p_message text default 'Too many tries just now. Give it a minute.'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from rate_limit_events
  where bucket = p_bucket
    and key    = p_key
    and at     > now() - p_window;

  if v_count >= p_limit then
    -- 54000 (program_limit_exceeded) maps to an HTTP 500 through PostgREST,
    -- which is fine — the message is the part a person reads, and it is written
    -- to be shown as-is.
    raise exception '%', p_message using errcode = '54000';
  end if;
end;
$$;

-- Records one failure.
create or replace function rl_record(p_bucket text, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into rate_limit_events (bucket, key) values (p_bucket, p_key);

  -- No cron for this, and it does not deserve one. Roughly one call in a
  -- hundred pays for the cleanup, which is ample for a table only failures
  -- ever write to.
  if random() < 0.01 then
    delete from rate_limit_events where at < now() - interval '24 hours';
  end if;
end;
$$;

-- Both helpers take an arbitrary key. Left callable, `anon` could write rows
-- under someone else's IP and lock a real family out of confirming a dose —
-- turning the defence into the attack. The security definer functions below
-- run as the owner, so they keep working.
--
-- Revoking from `public` is the part that actually does the work: Postgres
-- grants EXECUTE to PUBLIC on every new function, and both anon and
-- authenticated are members of PUBLIC — so naming them alone leaves the
-- function wide open. Revoke PUBLIC first, then the roles, so a Supabase
-- default grant on either one cannot put it back.
revoke execute on function rl_client_key() from public, anon, authenticated;
revoke execute on function rl_check(text, text, int, interval, text) from public, anon, authenticated;
revoke execute on function rl_record(text, text) from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* resolve_tag                                                                 */
/* -------------------------------------------------------------------------- */

-- Body is 007's, unchanged apart from the two rate limit calls. Same signature,
-- same OUT parameters, so `create or replace` is enough — no drop, and the
-- offline queue in lib/queue.ts keeps calling it with p_at exactly as before.
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
  v_key    text;
begin
  v_key := rl_client_key();

  -- 20 unknown tokens per quarter hour. A real sticker never lands here, so the
  -- only caller that can reach this ceiling is one guessing.
  --
  -- This one RETURNS rather than raising, unlike the others below, for two
  -- reasons. The client treats any error from this function as the network
  -- being down and queues the tap for replay — so raising here would fill the
  -- offline queue with taps that can never succeed and wedge every real tap
  -- behind them. And a guesser learns nothing: throttled looks exactly like
  -- wrong.
  if exists (
    select 1 from rate_limit_events
    where bucket = 'resolve_tag'
      and key    = v_key
      and at     > now() - interval '15 minutes'
    offset 19
  ) then
    return query select 'unknown_token'::resolve_outcome,
                        null::uuid, null::text, null::text,
                        null::timestamptz, null::timestamptz;
    return;
  end if;

  -- Never trust a device clock for a future time; a queued tap is always past.
  v_at := least(coalesce(p_at, now()), now());

  select * into v_tag from tags where token = p_token;
  if not found then
    perform rl_record('resolve_tag', v_key);
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

  -- A real tag pointing at a member with no medication yet. The tag existed, so
  -- this is a setup gap and not a guess — do not count it against the caller.
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

/* -------------------------------------------------------------------------- */
/* unclaimed_members                                                           */
/* -------------------------------------------------------------------------- */

-- Was `language sql` in 003. Same signature and same return type, so replacing
-- it in place is fine; it becomes plpgsql only so it can count its own misses.
--
-- 10 wrong codes per quarter hour. A family typing the code off a WhatsApp
-- message gets several goes at a typo and never notices this exists.
create or replace function unclaimed_members(p_join_code text)
returns table (id uuid, name text, role member_role, family_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key    text;
  v_exists boolean;
begin
  v_key := rl_client_key();

  perform rl_check(
    'join_code', v_key, 10, interval '15 minutes',
    'Too many tries with that code. Give it a minute and try again.'
  );

  select exists (
    select 1 from families f
    where upper(f.join_code) = upper(trim(p_join_code))
  ) into v_exists;

  if not v_exists then
    perform rl_record('join_code', v_key);
    return;
  end if;

  return query
    select m.id, m.name, m.role, f.name
    from members m
    join families f on f.id = m.family_id
    where upper(f.join_code) = upper(trim(p_join_code))
      and m.user_id is null
    order by m.created_at;
end;
$$;

/* -------------------------------------------------------------------------- */
/* claim_member_profile                                                        */
/* -------------------------------------------------------------------------- */

-- Shares the 'join_code' bucket with unclaimed_members deliberately: they are
-- two halves of one guessing surface, and an attacker who found a code through
-- either should not get a fresh allowance on the other.
--
-- "Already claimed" is a real person's honest mistake, not a guess, so it is
-- raised without being recorded.
create or replace function claim_member_profile(p_join_code text, p_member_id uuid)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member members%rowtype;
  v_key    text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;

  v_key := rl_client_key();

  perform rl_check(
    'join_code', v_key, 10, interval '15 minutes',
    'Too many tries with that code. Give it a minute and try again.'
  );

  select m.* into v_member
  from members m
  join families f on f.id = m.family_id
  where m.id = p_member_id
    and upper(f.join_code) = upper(trim(p_join_code));

  if not found then
    perform rl_record('join_code', v_key);
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

/* -------------------------------------------------------------------------- */
/* create_family                                                               */
/* -------------------------------------------------------------------------- */

-- Keyed on the user rather than the IP: this one needs a session, so we know
-- exactly who is calling and a shared home connection should not be punished
-- for one person's habits.
--
-- Five a day is far beyond any real use — a family is created once — while
-- still leaving room to make a mess during a demo and start over.
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

  perform rl_check(
    'create_family', auth.uid()::text, 5, interval '24 hours',
    'That is a lot of families for one day. Try again tomorrow.'
  );

  loop
    v_code := gen_join_code();
    exit when not exists (select 1 from families where join_code = v_code);
  end loop;

  insert into families (name, join_code)
  values (p_family_name, v_code)
  returning * into v_family;

  insert into members (family_id, user_id, name, role)
  values (v_family.id, auth.uid(), p_my_name, 'caregiver');

  -- The only bucket that counts successes: the thing being limited IS the
  -- successful creation, so there is no failure to count.
  perform rl_record('create_family', auth.uid()::text);

  return v_family;
end;
$$;

/* -------------------------------------------------------------------------- */
/* Closing the same hole in 009 and 011                                        */
/* -------------------------------------------------------------------------- */

-- Those two migrations revoked the job-only functions from `anon` and
-- `authenticated` and stopped there, which does nothing on its own: the PUBLIC
-- grant Postgres adds to every new function still applies, and both roles
-- inherit it.
--
-- `pending_alerts` is the one that matters. It is security definer, it returns
-- every caregiver's Expo push token alongside the care recipient's name and her
-- medication, and as things stand anyone with the anon key can call it. That is
-- a list of real people, what they take, and a channel to reach their family on.
revoke execute on function sweep_unconfirmed() from public, anon, authenticated;
revoke execute on function pending_alerts(int) from public, anon, authenticated;
revoke execute on function mark_alert_sent(uuid) from public, anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Checks                                                                      */
/* -------------------------------------------------------------------------- */

-- None of these should return a row. Anything listed here is still callable by
-- someone holding the anon key.
--
--   select p.proname, r.rolname
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--     cross join unnest(array['anon','authenticated']) as r(rolname)
--    where n.nspname = 'public'
--      and p.proname in ('rl_client_key','rl_check','rl_record',
--                        'sweep_unconfirmed','pending_alerts','mark_alert_sent')
--      and has_function_privilege(r.rolname, p.oid, 'execute');
--
-- The limiter is reachable from the functions that need it — this must still
-- confirm a dose exactly as before:
--
--   select * from resolve_tag('<a real token>', 'nfc');
--
-- And a made-up token must return 'unknown_token' twenty times, then refuse:
--
--   select outcome from resolve_tag('definitely-not-a-token', 'nfc');
--
-- Clear the bucket after testing so a demo does not start throttled:
--
--   delete from rate_limit_events;
