# Khairiyat — build plan

## Context

The repo is docs-only. `app/`, `components/`, `lib/` and `supabase/` exist but are empty,
there is no `package.json`, and `.env` is 0 bytes. Everything in `docs/` specifies an app
that has not been written yet.

The five docs are internally consistent and detailed enough to build from directly:
`PRODUCT.md` fixes the state machine and flows, `DESIGN.md` fixes every colour, type token
and screen layout, `SCHEMA.md` fixes the tables, RLS and RPC contracts, `DEMO.md` fixes
what the build has to survive on stage. No invention is required — the job is execution
against a written spec.

The product thesis, restated so the build stays honest to it: adherence is a **visibility
and routing problem**, not a reminder problem. The app exists to produce one confirmation
from an NFC tap on a pill box, and the wedge is three things derived from tap timestamps —
`unconfirmed` as a first-class state that never asserts a miss, adherence drift, and
refill runway.

### Decisions taken during planning

- **Solo build.** `BUILD_ORDER.md` allocates work across three developers (Dev A/B/C)
  working in parallel. There is one implementer. The parallel structure is not merely
  wrong, it is misleading about ordering, because it assumes three things happen at once
  that will now happen in sequence.
- **Supabase project does not exist yet.** SQL is written as files and pasted into the
  dashboard SQL editor.
- **QR rendering via `react-native-qrcode-svg`** — JS-only, draws through the already
  frozen `react-native-svg`, so no EAS rebuild.
- **The demo phone has confirmed NFC**, so NFC stays the hero path rather than being
  demoted to QR.

**Intended outcome:** a working Android dev-client build that satisfies the five beats of
`docs/DEMO.md`, with the MUST list of `docs/PRODUCT.md` complete and the SHOULD list
attempted in cut-list order.

---

## Phase 0 — Correct the runbook to a solo build

Rewrite `docs/BUILD_ORDER.md`:

- Delete the "Track ownership" table and the Dev A/B/C attributions throughout the
  timeline. Re-express the timeline as one serial track in dependency order.
- Keep verbatim: the H0 blocking checklist, **Gate at H3**, **Gate at H6**, the cut list,
  and "Things that will waste your night". These are the load-bearing parts and none of
  them depend on headcount.
- Replace "Dev C builds `lib/theme.ts` first because A and B depend on them" with the same
  fact stated as ordering: theme and primitives land before any screen.

Edit `CLAUDE.md` line 10: `~12 hours, 3 developers` → a solo build. Every other line in
`CLAUDE.md` is still accurate and stays untouched.

---

## Phase 1 — Scaffold and freeze native modules

This phase ends with an EAS build running in the background. Nothing after it is blocked
on that build finishing.

**Scaffold gotcha:** `create-expo-app` refuses a non-empty directory, and this one has
`.git`, `CLAUDE.md`, `docs/`, `.claude/`, `.env` and now `plan.md`. Scaffold into the
scratchpad with the `default` (expo-router) template, then copy `package.json`,
`tsconfig.json`, `app.json`, `babel.config.js`, `.gitignore` and `node_modules` into the
repo root, discarding the template's demo `app/` and `components/` content.

Install the frozen list from `CLAUDE.md` in **one** `npx expo install` invocation so
versions resolve against the SDK together, plus `react-native-qrcode-svg`.

`app.json` — all of this must be in the first build; adding any of it later costs another
~15 minutes:

- `"scheme": "khairiyat"` and an `android.package`
- Android intent filter for `khairiyat://t/*` (`VIEW` / `BROWSABLE` / `DEFAULT`)
- Plugins: `expo-router`, `expo-notifications`, `expo-camera` (camera permission string),
  `expo-font`, `react-native-nfc-manager`, `react-native-android-widget`

`eas.json` — `development` profile with `"developmentClient": true`,
`"distribution": "internal"`, `"android": { "buildType": "apk" }`. APK, never AAB: an APK
sideloads onto a borrowed phone in two minutes and an AAB does not.

---

## Phase 2 — Database

Numbered files in `supabase/migrations/`, applied by pasting into the dashboard SQL
editor. Never edit one after it has been applied.

- `001_schema.sql` — the three enums, plus `families`, `members`, `medications`,
  `dose_windows`, `tags`, `emergency_info` exactly as tabulated in `docs/SCHEMA.md`.
  Includes the unique index on `(medication_id, scheduled_at)` — that index is what makes
  lazy generation idempotent — and the index on `(family_id, scheduled_at)`.
- `002_rls.sql` — enable RLS on every table, the `is_family_member(uuid)` security-definer
  helper, and the policy set. Join-family is deliberately left blocked here; it is handled
  by RPC, not by loosening a policy.
- `003_rpcs.sql` — `ensure_dose_windows`, `mark_stale_unconfirmed`, `resolve_tag`,
  `claim_member_profile`. `resolve_tag` follows the seven numbered steps in `SCHEMA.md`,
  including the 10-minute double-tap swallow and the ±120-minute nearest-window search,
  and returns an outcome enum so the client can pick the right full-screen state.
- `004_realtime.sql` — `alter publication supabase_realtime add table dose_windows`.
- `seed.sql` — one family, one care recipient, two caregivers, three medications, and
  21 days of backdated windows at ~85% adherence, with the evening dose drifting later
  across the three weeks and one medication down to 4 days of stock.

Seed members are created with `user_id` null so the file is pure SQL with no auth
dependency. You sign up in the app and claim a profile with the join code, which exercises
the real claim flow rather than faking it.

Timezone correctness: `ensure_dose_windows` builds `scheduled_at` by interpreting each
`medications.times` entry in the **member's own** `timezone`, not in UTC and not in the
device's zone.

---

## Phase 3 — Theme and UI primitives

Everything visual depends on this, so it lands before any screen.

`lib/theme.ts` is the single source of truth: `{ light, dark }` colour pairs (both tables
in `DESIGN.md` transcribed exactly), the type scale with family/size/weight per token, the
Simple Mode overrides, `space` and `radius`. A `useTheme()` hook resolves
System/Light/Dark, persisting the override to AsyncStorage.

`components/ui/`: `Text` (applies the type scale and font family — screens import this,
never React Native's), `Screen`, `Card`, `Button`, and `DoseRing`.

`DoseRing` is the signature element and the highest-value component in the repo. It
encodes all six states in **shape as well as colour** per `DESIGN.md` — hollow / filled /
amber dot / 45% opacity / diagonal slash / dashed — because `.claude/rules/ui.md` forbids
conveying state by colour alone. Drawn in `react-native-svg` and sized by prop, so one
component serves the 12dp adherence grid cell, the dashboard row, the 64dp Simple Mode
cell and the full-screen confirmation.

Fonts: Fraunces and Inter via `@expo-google-fonts`, loaded at root with the splash held
until ready. Numerals get `fontVariant: ['tabular-nums']` at the token level so no screen
has to remember.

Also at app start, per the gotchas: create the Android notification channel, or
`expo-notifications` will silently drop every scheduled reminder.

---

## Phase 4 — Client, auth, family setup

`lib/supabase.ts` — client with AsyncStorage-backed session persistence,
`autoRefreshToken`, `detectSessionInUrl: false`.

`app/(auth)/` — sign in / sign up as one screen with a bottom toggle; create family (one
field); join family (six separate code boxes, then a list of unclaimed member names to
pick from, calling `claim_member_profile`); claim profile.

`app/(caregiver)/` setup flows — add members on a single screen with an always-visible
inline add row (name + role segmented control + add), no modals and no wizard steps; add
medication with the **time chips** picker (Morning / Afternoon / Night / + Custom), never
a per-row time-picker dialog. That friction is what makes the screen fail.

Root layout routes by session and role: no session → auth; care recipient → `(simple)`;
caregiver → `(caregiver)`.

The onboarding path must run under 90 seconds — it is the flow a judge watches.

---

## Phase 5 — The spine (Gate at H3)

`app/t/[token].tsx` resolves a token by calling `resolve_tag` and renders the full-screen
confirmation: `accentSurface`, no chrome, the ring animating to filled on a 320ms spring
paired with `Haptics.notificationAsync(Success)`, medication name, time in `display`
numerals, auto-dismiss to Simple Mode after 4s with a Done button for impatience. Failure
states get the same full-screen treatment in `redSurface` with a plain explanation and a
manual-log button — never a toast, never an alert dialog.

The in-app QR scanner (`expo-camera`) reads the same token and calls the same RPC. One
resolver, two inputs.

**Gate: a QR scan produces a `confirmed` row visible in the Supabase table.** If this is
not working, everything else stops until it is. It is the entire product.

---

## Phase 6 — The screens that get demoed

- **Caregiver dashboard** — family name in Fraunces, tappable join code, the NEEDS
  ATTENTION section (absent entirely when empty — not an empty state), and one card per
  member showing the day as a horizontal row of Dose Rings. Subscribed to `dose_windows`
  realtime filtered on `family_id`; a ring filling while a judge watches is Beat 2.
- **Simple Mode** — today's own doses only, huge type, one 64dp button per dose, no
  navigation, no family data.
- `ensure_dose_windows` + `mark_stale_unconfirmed` called on app foreground and on
  pull-to-refresh. There is no cron; this is the scheduler.

---

## Phase 7 — NFC (Gate at H6)

`lib/nfc.ts` — read and write, **always feature-detected**, falling back to the QR scanner
when NFC is absent. Tags are written with the custom scheme `khairiyat://t/<token>`, never
an https URL, or Android opens a browser instead of the app.

Tag setup screen: concentric-circle SVG target, instruction line, live status, success
state, and the QR for the same token rendered below via `react-native-qrcode-svg`.

**Gate: tap a written tag with the app fully closed → app launches → dose confirms →
dashboard updates.** That is the demo; everything after this point is upside.

---

## Phase 8 — Depth

`lib/doses.ts`, in JS rather than SQL as `SCHEMA.md` specifies: adherence rate over 14
days; drift, reported only when the change exceeds 20 minutes with at least 5 samples in
each period, rendered as **one sentence about one medication** in an `accentSurface` card;
refill runway, floored, amber under 5 days.

Member detail: today's rings large, medication list with runway per medication, the 14-day
adherence grid, the drift sentence, emergency info row at the bottom.

Resolve sheet: three actions phrased as what the caregiver did — "She took it", "She
missed it", "Couldn't reach her" — plus a Call button that opens the dialer. This is
Beat 3, the beat that wins the technical argument.

Emergency info screen, one tap from member detail.

---

## Phase 9 — Remaining scope, in cut-list order

Scheduled local reminder notifications with a "Taken" action; Settings (theme segmented
control, family code, sign out — three rows, no more). Then the Android widget: the app
writes a compact summary to AsyncStorage on foreground and the task handler renders from
that snapshot, because the widget cannot reach Supabase. **The widget is first on the cut
list — if it fights back, it is deleted, not debugged.**

Final polish: empty, loading and error states; a dark-mode audit on every screen; and a
copy pass against `.claude/rules/ui.md` — sentence case, never blame the parent, never say
"user", "record" or "sync".

---

## Verification

- `npx tsc --noEmit` clean after each batch of changes, not after each edit.
- **Grep gate for the repo's most important rule:** search `app/` and `components/` for
  hex literals and for numeric `padding` / `margin` / `fontSize` / `borderRadius` values.
  A single hardcoded `#fff` breaks dark mode invisibly. Also confirm no file imports `Text`
  from `react-native`.
- After Phase 2, confirm in the dashboard that the seed produced 21 days of windows, that
  a drift sentence actually renders, and that one medication reads 4 days of stock.
  Without this the two strongest lines of Beat 4 have nothing behind them.
- After Phase 5, the H3 gate: QR scan → `confirmed` row in the table.
- After Phase 7, the H6 gate: closed app, tag tap, confirmation, dashboard update.
- Run every flow through **account switching on one device** as well — one Android phone
  is the only guaranteed hardware.
- Full dry run against all five beats of `docs/DEMO.md`, then screen-record a clean pass
  as the backup.

---

## What needs you, not me

- Creating the Supabase project and pasting URL + anon key into `.env`
- Pasting each migration and the seed into the dashboard SQL editor
- `eas login` and starting the build
- Sideloading the APK
- All physical NFC testing — there is no emulator path for it
