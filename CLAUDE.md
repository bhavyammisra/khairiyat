# Khairiyat

Android app (Expo / React Native / TypeScript) that lets a family know whether an aging
parent has taken their medication. The parent taps an NFC sticker on their pill box;
caregivers in other cities see it confirmed live. Supabase backend.

The name is Urdu/Hindi for wellbeing — "khairiyat se ho?" ("are you well?"). Keep
user-facing copy warm and domestic to match; see `.claude/rules/ui.md`.

Hackathon build: ~12 hours, built solo. Prefer the shortest correct implementation.
No abstraction layers, no premature generalisation, no "future-proofing".

## Commands

- Install: `npm install`
- Dev server: `npx expo start --dev-client`
- Build dev client (Android APK): `eas build --profile development --platform android`
- Typecheck: `npx tsc --noEmit`
- Test: `npm test` — Node's own runner, no framework. Needs Node 24: it strips types,
  mocks AsyncStorage with `node:test` module mocks, and uses the resolver hook in
  `scripts/` so Node can follow the app's extensionless imports. Both run on push
  (`.github/workflows/ci.yml`).
- Migrations live in `supabase/migrations/`. There is no Supabase CLI configured —
  apply by pasting the SQL into the Supabase dashboard SQL editor.

## Hard constraints

- **NEVER add a native module.** Every native dependency forces a new ~15-minute EAS
  build and the schedule cannot absorb one. The list below is frozen. JS-only packages
  are fine to add after asking.
- **This app does not run in Expo Go.** NFC, widgets and notification channels require
  the custom dev client.
- NFC is testable only on a physical Android device — there is no emulator path.
  NEVER write code that assumes NFC exists. Always feature-detect and fall back to the
  in-app QR scanner.
- Only ONE Android phone is guaranteed for the demo. Any flow that requires two phones
  simultaneously must also work via account switching on one device.

## Native modules (frozen)

`expo-router`, `expo-notifications`, `expo-camera`, `expo-font`, `expo-haptics`,
`expo-linking`, `react-native-nfc-manager`, `react-native-android-widget`,
`@react-native-async-storage/async-storage`, `@supabase/supabase-js`,
`react-native-safe-area-context`, `react-native-svg`,
`@expo-google-fonts/fraunces`, `@expo-google-fonts/inter`

Also in the build, and equally frozen:

- `expo-dev-client` — required by `--dev-client` and `developmentClient: true`.
- `react-native-reanimated`, `react-native-worklets`, `react-native-screens` —
  pulled in transitively by `expo-router`. **Pin them to the versions Expo
  bundles for the SDK** (`https://api.expo.dev/v2/sdks/<version>/native-modules`).
  Left unpinned, npm resolves a reanimated too new for `expo-modules-core`, and
  the EAS build dies in "Install dependencies" while `npm install` succeeds
  locally.

JS-only, safe to change without a rebuild: `react-native-qrcode-svg` (draws
through `react-native-svg`).

## Architecture

- `app/` — expo-router routes
  - `app/index.tsx` — the only route at `/`. Gate: redirects on session and role.
  - `app/(auth)/` — sign in, create family, join family, claim profile
  - `app/(caregiver)/` — `home.tsx` dashboard, member detail, medications, tag setup
  - `app/(simple)/` — `home.tsx`, care-recipient mode (large type, own doses only)
  - `app/t/[token].tsx` — deep-link target for an NFC tap

  Group entry screens are `home.tsx`, **not** `index.tsx`. Group folders add no
  path segment, so two `(group)/index.tsx` files plus `app/index.tsx` would all
  resolve to `/` and collide.

- `plugins/withNfcIntentFilter.js` — adds the `NDEF_DISCOVERED` intent filter.
  Android never dispatches an NFC tag via `ACTION_VIEW`, and `app.json` cannot
  express a non-`android.intent.action.*` action.
- `components/ui/` — primitives: `Text`, `Button`, `Card`, `DoseRing`, `Screen`
- `lib/theme.ts` — design tokens. Single source of truth for colour, type, spacing.
- `lib/doses.ts` — dose window state, adherence drift, refill runway
- `lib/nfc.ts`, `lib/notifications.ts`, `lib/supabase.ts`
- `supabase/migrations/` — numbered SQL files

## Code style

- TypeScript strict. No `any`.
- Named exports only. Exception: expo-router route files require a default export.
- **NEVER hardcode a colour, font size, radius or spacing value inside a component.**
  Import from `lib/theme.ts`. This is the most important rule in the repo — a single
  hardcoded `#fff` breaks dark mode invisibly.
- Import `Text` from `components/ui`, never from `react-native`. The wrapper applies the
  type scale and font family; the raw one does not.
- Spacing comes from `theme.space` only. No arbitrary pixel margins.
- Dose window boundaries are computed from the Supabase server timestamp, never from the
  device clock alone.

## Workflow

- Read `docs/DESIGN.md` before building any screen. Do not invent layout or colour.
- Read `docs/PRODUCT.md` before building any flow. Do not invent states.
- Typecheck after a batch of changes, not after every edit.
- Schema changes go in a new numbered file in `supabase/migrations/`. Never edit a
  migration that has already been applied.
- Ask before installing anything.

## Gotchas

- NFC tags carry the custom scheme `khairiyat://t/<token>`. Do **not** write https URLs
  to tags — no domain is configured and Android would open a browser instead of the app.
- QR codes encode the same token and are read by the in-app `expo-camera` scanner only.
  A phone's stock camera app cannot open them. This is intentional.
- `expo-notifications` silently drops scheduled notifications on Android unless a
  notification channel is created first. Create it at app start.
- Supabase realtime requires the table be added to the `supabase_realtime` publication.
  If the dashboard doesn't live-update, check that before debugging client code.
- The Android widget cannot reach Supabase. The app writes a compact summary to
  AsyncStorage on foreground; the widget task handler renders from that snapshot.
- Dose windows are generated lazily by an RPC on app open, not by cron. That part still
  has no scheduler. There *is* now a `pg_cron` job, added later and for one job only:
  sweeping unconfirmed doses and pushing to caregivers, which by definition has to
  happen when nobody has the app open. Credentials live in Supabase Vault, not inline
  in `cron.job`. See **Alerts and push** in `docs/SCHEMA.md`.
- A care recipient may not have an email address of their own. Profiles are created by
  the caregiver and *claimed* later; never assume a member row has an auth user.

## Environment

`.env` (Expo reads `EXPO_PUBLIC_*` at build time):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Docs

- `docs/PRODUCT.md` — scope, roles, user flows, state machine
- `docs/DESIGN.md` — design system and per-screen specs
- `docs/SCHEMA.md` — tables, RLS, RPCs
- `docs/BUILD_ORDER.md` — hour-by-hour plan, ownership, cut list
- `docs/DEMO.md` — the demo the build must support
