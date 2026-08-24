# Khairiyat — Supabase schema

Postgres + Supabase auth + realtime. Everything the app shows is derived from
`dose_windows`; keep that table as the single source of truth.

## Enums

```sql
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
```

## Tables

### `families`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `name` | text not null | "Rana Family" |
| `join_code` | text unique not null | 6 chars, uppercase, no `0/O/1/I` |
| `created_at` | timestamptz | `now()` |

### `members`

A person in a family. **May have no auth user** — the caregiver creates the profile and
the person claims it later. Never assume `user_id` is present.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `family_id` | uuid fk → families | on delete cascade |
| `user_id` | uuid fk → auth.users | **nullable** |
| `name` | text not null | |
| `role` | member_role not null | |
| `phone` | text | for tap-to-call |
| `timezone` | text not null | default `'Asia/Kolkata'` |
| `created_at` | timestamptz | |

### `medications`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `member_id` | uuid fk → members | on delete cascade |
| `name` | text not null | "Amlodipine" |
| `dose_text` | text | "5mg · 1 tablet" — display only |
| `times` | time[] not null | `{'08:00','21:00'}` |
| `quantity_remaining` | int | units in hand; nullable |
| `units_per_dose` | int not null default 1 | |
| `active` | bool not null default true | |
| `created_at` | timestamptz | |

### `dose_windows`

One row per expected dose per day. Generated lazily.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `medication_id` | uuid fk → medications | on delete cascade |
| `member_id` | uuid fk → members | denormalised for query speed and RLS |
| `family_id` | uuid fk → families | denormalised |
| `scheduled_at` | timestamptz not null | |
| `state` | dose_state not null default `'pending'` | |
| `confirmed_at` | timestamptz | actual tap time — drift is computed from this |
| `source` | log_source | |
| `resolved_by` | uuid fk → members | |
| `resolved_at` | timestamptz | |

Unique index on `(medication_id, scheduled_at)` — this is what makes lazy generation
idempotent. Index on `(family_id, scheduled_at)`.

### `tags`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `token` | text unique not null | 12 chars, url-safe, random |
| `member_id` | uuid fk → members | |
| `medication_id` | uuid fk → medications | nullable — null means "any due dose" |
| `label` | text | "Morning pill box" |
| `created_at` | timestamptz | |

### `emergency_info`

One row per member. All fields nullable.

`member_id` (pk, fk), `blood_group`, `allergies` text[], `conditions` text[],
`insurance_note`, `updated_at`.

## RLS

Enable on every table. The whole policy set rests on one helper:

```sql
create or replace function is_family_member(fid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from members
    where family_id = fid and user_id = auth.uid()
  );
$$;
```

- `families`: select where `is_family_member(id)`. Insert allowed to any authed user.
- `members`: select/insert/update where `is_family_member(family_id)`.
- `medications`, `tags`, `emergency_info`: gate through the member's `family_id`
  (join to `members`).
- `dose_windows`: select/update where `is_family_member(family_id)`.

**Joining a family is the one flow RLS blocks**, because the user isn't a member yet.
Handle it with a `security definer` RPC (`claim_member_profile`), not by loosening
policies.

## RPCs

### `ensure_dose_windows(p_family_id uuid, p_date date)`

Generates missing `dose_windows` for every active medication of every member in the
family for that date, using the member's timezone. Idempotent via the unique index
(`on conflict do nothing`). Called by the client on app foreground and on pull-to-refresh.

Window generation stays lazy — there is still no scheduler behind it. This document
used to add "do not add pg_cron" here, and that was right for as long as the app was
the only thing that ever needed to act. It stopped being right once a caregiver was
meant to be told about an unconfirmed dose *without* opening the app: nobody's phone
is awake to notice. `pg_cron` now runs the alert sweep only (migration 010, secrets
moved to Vault in 013). See **Alerts and push** below.

### `mark_stale_unconfirmed(p_family_id uuid)`

Sets `state = 'unconfirmed'` for any `pending` window whose `scheduled_at` is more than
60 minutes in the past. Called immediately after `ensure_dose_windows`.

### `resolve_tag(p_token text, p_source log_source, p_at timestamptz default null)`

The hero path. Runs as `security definer`:

0. Refuse if this caller has already burned through its allowance of unrecognised
   tokens (see **Rate limits**).
1. Look up the tag; `unknown_token` if there is no such tag.
2. Ensure today's windows exist for that member.
3. Find the nearest window for the tag's medication within ±120 minutes of the tap,
   preferring `pending`, then `unconfirmed`.
4. If that window is already `confirmed` and was confirmed under 10 minutes ago, return
   it unchanged (double-tap protection).
5. Otherwise set `state = 'confirmed'`, `confirmed_at`, `source = p_source`, and
   decrement `medications.quantity_remaining` by `units_per_dose`.
6. If no window is in range, insert an ad-hoc confirmed window and flag it as extra.
7. Return the medication name, scheduled time, confirmed time, and an outcome enum so the
   client can render the right full-screen state.

`p_at` is the moment the sticker was actually tapped, sent by the offline queue when a
tap is replayed later; it defaults to `now()` for a live tap and is clamped so a device
with a wrong clock cannot claim a dose in the future. Without it, a dose taken at 08:05
and synced at 18:00 would land in the evening window and poison the drift calculation.
`confirm_dose` takes the same argument for the same reason.

### `claim_member_profile(p_join_code text, p_member_id uuid)`

`security definer`. Verifies the code matches the member's family and that
`members.user_id is null`, then sets `user_id = auth.uid()`. Rate limited — it shares a
bucket with `unclaimed_members`, since the two are halves of one guessing surface.

### `confirm_dose(p_dose_window_id uuid, p_source log_source, p_at timestamptz default null)`

The Simple Mode button and the notification action. Same double-tap protection and same
stock decrement as `resolve_tag`, but against a window the client already knows.

### `record_refill(p_medication_id uuid, p_units int)`

Adds units back to `medications.quantity_remaining` when a box is refilled. Refill runway
is only honest if someone tells us the box was topped up (migration 008).

## Alerts and push

Added in 009, fixed in 011, secrets moved to Vault in 013.

Everything above only happens while somebody has the app open. The whole promise of the
product is that a family in another city finds out *without* doing anything, which needs
one thing the client cannot provide: something awake when nobody is looking.

### `devices`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `member_id` | uuid not null | → `members` |
| `push_token` | text not null | `ExponentPushToken[...]` |
| `platform` | text | |
| `updated_at` | timestamptz | |

Unique on `(member_id, push_token)`. Written by `register_device(p_push_token, p_platform)`
at app start. A caregiver with no row here cannot be told anything.

### `unconfirmed_alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `dose_window_id` | uuid not null unique | → `dose_windows` |
| `family_id` | uuid not null | → `families` |
| `created_at` | timestamptz | |
| `sent_at` | timestamptz | null while pending |

Unique on `dose_window_id`, so a dose is never alerted twice however often the job runs.

### The sweep

`pg_cron` calls the `notify` edge function every 15 minutes (migration 010; credentials
live in Supabase Vault as of 013, not inline in `cron.job`). The function calls:

- `sweep_unconfirmed()` — flips stale `pending` windows to `unconfirmed`, closes out
  alerts whose dose has since been resolved or confirmed, and queues new ones.
- `pending_alerts(p_limit)` — unsent alerts with the caregivers' push tokens attached.
  Never the care recipient's: we tell the family, never the person who already forgot.
- `mark_alert_sent(p_alert_id)` — after delivery.

All three are revoked from `anon` and `authenticated`. They are for the job, not the app.

An alert with no registered device is **left pending**, not marked sent — a family that
installs the app before enabling notifications would otherwise silently lose every early
alert. `created_at` in the payload is what lets the sender tell a fresh alert (wait, a
device may appear in a minute) from a stale one (give up).

## Rate limits

Added in 012. Four `security definer` functions are callable by anyone holding the anon
key, which ships inside the APK and is public by design. Three of them are enumerable:
`resolve_tag` takes a token, and `unclaimed_members` / `claim_member_profile` take a
six-character join code — about 1e9 combinations, with a family's name and its members'
real names as the prize for a hit.

`rate_limit_events (bucket, key, at)` backs it, with RLS on and no policies so PostgREST
cannot reach it. `rl_check` raises when the caller is over; `rl_record` logs one failure.
Both are revoked from `anon` and `authenticated` — left callable, anyone could write rows
under someone else's key and lock a real family out.

| Bucket | Keyed on | Allowance | Counts |
|---|---|---|---|
| `resolve_tag` | client IP | 20 / 15 min | unrecognised tokens |
| `join_code` | client IP | 10 / 15 min | codes that match no family |
| `create_family` | `auth.uid()` | 5 / 24 h | successful creations |

**Only failures are counted.** A family tapping a real sticker never writes a row and can
never be throttled. Refusing a genuine tap would be a worse bug than the attack this
prevents — the dose is the product.

The IP comes from `cf-connecting-ip` in `current_setting('request.headers')`, which the
edge sets and a client cannot forge; `x-forwarded-for` is read from the right, where the
nearest trusted proxy appends, and is the fallback. With neither, every caller shares one
bucket — a global limit rather than no limit.

## Migration map

| File | What it did |
|---|---|
| `001_schema` | Tables, enums, indexes |
| `002_rls` | `is_family_member` and every policy |
| `003_rpcs` | `resolve_tag`, `create_family`, joining, `resolve_dose` |
| `004_realtime` | `dose_windows` into the publication |
| `005_confirm_dose` | Simple Mode button path |
| `006_fix_window_generation` | Generate in the member's timezone, not the server's |
| `007_offline_taps` | `p_at` on `resolve_tag` / `confirm_dose` |
| `008_refills` | `record_refill` |
| `009_push_alerts` | `devices`, `unconfirmed_alerts`, the sweep |
| `010_schedule` | `pg_cron` every 15 minutes |
| `011_alert_lifecycle` | Don't drop alerts with no device; close resolved ones |
| `012_rate_limits` | `rate_limit_events` and the limits above |
| `013_notify_secrets_vault` | Cron credentials out of plaintext into Vault |

There is no Supabase CLI configured. Apply by pasting into the dashboard SQL editor, in
order. Never edit a file that has already been applied — add a new one.

## Derived logic (client-side, `lib/doses.ts`)

Do not put these in SQL — they are cheap in JS and easier to tune under time pressure.

- **Adherence rate** — confirmed + resolved_taken over total windows, last 14 days.
- **Drift** — for each medication and each scheduled time, the mean offset of
  `confirmed_at - scheduled_at` in the last 7 days versus the 7 days before. Report only
  when the change exceeds 20 minutes and there are at least 5 samples in each period.
  One sentence, one medication, the largest drift only. Never show a chart of noise.

  A window is grouped by which of the medication's **own** `times` it sits nearest to,
  within 90 minutes, using `member.timezone` to convert. Not by its raw UTC minute: that
  is the same thing in India, which has no daylight saving, but anywhere that does, one
  8am dose moves an hour in UTC twice a year, splits a fourteen-day bucket into two
  sevens, drops both under the sample floor, and the insight vanishes with nothing to
  show that it did. Windows more than 90 minutes from any current scheduled time are
  dropped — their time has since been edited, and folding them in would invent hours of
  drift that never happened.
- **Refill runway** — `quantity_remaining / (units_per_dose × doses_per_day)`, floored.
  Amber under 5 days.

## Realtime

Add `dose_windows` to the `supabase_realtime` publication. The dashboard subscribes
filtered on `family_id`. Nothing else needs realtime.

```sql
alter publication supabase_realtime add table dose_windows;
```

## Seed data

Ship a `supabase/seed.sql` that creates one family with a care recipient, two caregivers,
three medications, and **21 days of backdated dose windows** with realistic imperfection:
~85% adherence, the evening dose drifting later across the three weeks, and one
medication down to 4 days of stock. Without this, drift and runway have nothing to show
and the demo falls flat.

Pinning *both* evening doses to keep the drift calculation above its sample floor had
pushed the headline to ~92%, which reads as a solved problem. Only Metformin's 21:00
dose is pinned now; the other three windows run at 16/20 taken, which lands the blend
back on 85%.
