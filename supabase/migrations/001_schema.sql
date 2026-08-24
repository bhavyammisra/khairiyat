-- 001_schema.sql — enums, tables, indexes
-- Applied by pasting into the Supabase dashboard SQL editor.
-- Never edit this file after it has been applied; add a new numbered file instead.

create extension if not exists pgcrypto;

-- Enums ---------------------------------------------------------------------

create type member_role as enum ('caregiver', 'care_recipient');

create type dose_state as enum (
  'pending',
  'confirmed',
  'unconfirmed',
  'resolved_taken',
  'resolved_missed',
  'resolved_unreachable'
);

create type log_source as enum ('nfc', 'qr', 'button', 'notification', 'caregiver');

-- Join codes ----------------------------------------------------------------
-- 6 chars, uppercase, excluding 0/O/1/I so they can be read aloud over a phone
-- call without ambiguity — which is exactly how a family will share one.

create or replace function gen_join_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
           floor(random() * 32)::int + 1, 1),
    ''
  )
  from generate_series(1, 6);
$$;

-- Tables --------------------------------------------------------------------

create table families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  join_code  text unique not null default gen_join_code(),
  created_at timestamptz not null default now()
);

-- A person in a family. May have NO auth user: the caregiver creates the
-- profile and the person claims it later. Never assume user_id is present.
create table members (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null,
  role       member_role not null,
  phone      text,
  timezone   text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now()
);

create index members_family_idx on members (family_id);

-- One auth user holds at most one profile per family.
create unique index members_family_user_idx
  on members (family_id, user_id)
  where user_id is not null;

create table medications (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references members(id) on delete cascade,
  name               text not null,
  dose_text          text,
  times              time[] not null,
  quantity_remaining int,
  units_per_dose     int not null default 1,
  active             bool not null default true,
  created_at         timestamptz not null default now()
);

create index medications_member_idx on medications (member_id) where active;

-- One row per expected dose per day. Generated lazily by ensure_dose_windows.
create table dose_windows (
  id            uuid primary key default gen_random_uuid(),
  medication_id uuid not null references medications(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  family_id     uuid not null references families(id) on delete cascade,
  scheduled_at  timestamptz not null,
  state         dose_state not null default 'pending',
  confirmed_at  timestamptz,
  source        log_source,
  resolved_by   uuid references members(id) on delete set null,
  resolved_at   timestamptz,
  -- Set when a tap landed outside every window and we logged it anyway.
  -- resolve_tag step 6 requires somewhere to record that.
  is_extra      bool not null default false
);

-- This unique index is what makes lazy generation idempotent. Without it,
-- every app foreground would duplicate the day.
create unique index dose_windows_med_sched_idx
  on dose_windows (medication_id, scheduled_at);

create index dose_windows_family_sched_idx
  on dose_windows (family_id, scheduled_at);

create index dose_windows_member_sched_idx
  on dose_windows (member_id, scheduled_at);

create table tags (
  id            uuid primary key default gen_random_uuid(),
  token         text unique not null,
  member_id     uuid not null references members(id) on delete cascade,
  -- null means "any due dose for this member"
  medication_id uuid references medications(id) on delete cascade,
  label         text,
  created_at    timestamptz not null default now()
);

create index tags_member_idx on tags (member_id);

create table emergency_info (
  member_id      uuid primary key references members(id) on delete cascade,
  blood_group    text,
  allergies      text[],
  conditions     text[],
  insurance_note text,
  updated_at     timestamptz not null default now()
);
