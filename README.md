# Khairiyat

**An NFC tap on the pill box tells the whole family the dose was taken.**

Khairiyat is an Android app for families living apart: an aging parent alone in one city, adult children in
another. The parent taps their phone against a sticker on the pill box after taking a dose, and every caregiver
sees it confirmed live, wherever they are.

The name is Hindi and Urdu for wellbeing, as in *"khairiyat se ho?"* ("are you well?").

Built for **Cosmicathon 2026**, where it reached **Round 2**.

## The problem

Every pill reminder app notifies the person who already forgot. That is a closed loop with no observer: nobody in
the family knows a dose was skipped until something goes wrong.

Khairiyat treats medication adherence as a **visibility and routing problem**, not a reminder problem. The family,
not the app, is the intervention.

## How it works

1. **The tap.** The parent taps their phone on an NFC sticker on the pill box, even with the app closed. The app
   opens, confirms the nearest dose, gives a haptic pulse and shows the time in large numerals, then gets out of
   the way.
2. **The family sees it.** The caregiver dashboard updates live through Supabase Realtime. Nobody refreshes anything.
3. **Silence gets noticed.** If a dose window passes with no tap, the dose becomes *unconfirmed* and caregivers get
   a push alert, even if nobody has the app open.
4. **A person resolves it.** The caregiver calls, then marks what happened: *she took it*, *she missed it*, or
   *couldn't reach her*.

### Three ways to confirm a dose

| | Works on |
|---|---|
| NFC tap on the pill box sticker (`khairiyat://t/<token>`) | Phones with NFC |
| In-app QR scan of the same sticker, same token, same code path | Every phone with a camera |
| One big button per dose in Simple Mode | Always |

## What makes it more than a dose log

**Unconfirmed is a real state.** "She took it and forgot to tap" is the failure that kills adherence apps. Khairiyat
never claims a dose was missed. It says there is no confirmation and hands it to a human. Over time, the resolution
outcomes separate *forgets pills* from *forgets to tap*, two different problems a reminder app cannot tell apart.

```
scheduled -> pending -> confirmed                      (tap, QR or button)
                 |
                 +-> unconfirmed -> resolved_taken
                                 -> resolved_missed
                                 -> resolved_unreachable
```

A dose window is open from its scheduled time through a 60-minute grace period. A tap outside any open window
attaches to the nearest window within 120 minutes, and a second tap within 10 minutes is ignored, not counted twice.

**Signals derived from tap timestamps alone:**
- **Adherence drift:** doses sliding later week over week, one medication skipped more than the others, weekend gaps.
  Shown as a plain sentence, like "The evening dose has moved forty minutes later over the last three weeks."
- **Refill runway:** doses taken against the quantity dispensed gives days until the box is empty, so the family can
  reorder before it runs out.
- **Check-in nudge:** a dashboard of confirmed doses can be perfectly green while nobody has spoken to the parent in
  weeks. The app counts days since the last call, and one tap places it.

## Built for bad days

- **Offline taps.** A tap with no network is written to the phone with the time it happened and replayed later
  against that time, not the time of the sync. Otherwise a dose taken at 08:05 and synced at 18:00 would land in the
  wrong window and corrupt drift detection.
- **Server-side alerts.** A `pg_cron` sweep runs every fifteen minutes, marks expired windows unconfirmed and pushes
  to caregivers' devices through a Supabase Edge Function. It never notifies the care recipient, the phone that
  already forgot.
- **The database enforces the rules.** Dose windows, confirmation and resolution run as PostgreSQL functions behind
  row-level security, so a client cannot skip a state or read another family's data.
- **Guessing is rate-limited.** Tag tokens and family join codes are checked by public functions, so repeated
  failed attempts are throttled. Only failures count, so a real tap or a real code is never locked out.
- **Secrets stay out of the database jobs.** The push sweep's credentials live in Supabase Vault, not inline in
  the cron job.
- **Window boundaries come from the server clock**, never the device clock alone.

## Two kinds of user, one app

- **Caregiver** (the adult child): sees the whole family, adds members and medications, writes tags, resolves
  unconfirmed doses, and has an emergency info screen per parent with blood group, allergies, conditions, current
  medications and tap-to-call numbers.
- **Care recipient** (the parent): opens straight into **Simple Mode**, with today's own doses in large type, one
  button per dose and nothing else to get lost in.

Families join with a 6-character family code. A parent does not need an email address: the caregiver creates the
profile and it is claimed later. There is also an Android home screen widget showing today's doses.

## Stack

| Part | Uses |
|---|---|
| App | React Native 0.86, Expo SDK 57 (custom dev client), Expo Router, TypeScript strict |
| Device | `react-native-nfc-manager`, `expo-camera` (QR), `expo-notifications`, `react-native-android-widget` |
| Backend | Supabase: PostgreSQL, row-level security, RPCs, Realtime, Edge Functions, Vault, `pg_cron` |
| Tests | Node's built-in test runner on the dose, check-in, queue, widget and error logic |

## Project layout

```
app/
  index.tsx              gate: routes by session and role
  (auth)/                sign in, create family, join family, claim profile
  (caregiver)/           dashboard, member detail, medications, tag setup
  (simple)/              Simple Mode for the care recipient
  t/[token].tsx          deep-link target for an NFC tap or QR scan
lib/
  doses.ts               dose window state, adherence drift, refill runway
  queue.ts               offline tap queue
  checkin.ts             check-in nudge
  nfc.ts, notifications.ts, supabase.ts, theme.ts
components/ui/           Text, Button, Card, DoseRing, Screen
widget/                  Android home screen widgets
plugins/                 config plugin for the NFC intent filter
supabase/
  migrations/            001 to 013: schema, RLS, RPCs, realtime, offline taps, refills, push alerts, rate limits
  functions/notify/      Edge Function that sends push alerts
docs/                    product spec, design system, schema, demo script
```

## Run it

You need Node 24, an Android phone (NFC cannot be tested on an emulator) and a Supabase project.

1. Create `.env` with your Supabase project:
   ```
   EXPO_PUBLIC_SUPABASE_URL=...
   EXPO_PUBLIC_SUPABASE_ANON_KEY=...
   ```
2. Apply `supabase/migrations/001` to `013` in order, in the Supabase SQL editor. `supabase/seed.sql` adds demo data.
3. Install and build the development client. The app does not run in Expo Go, because NFC, widgets and
   notification channels need native code.
   ```bash
   npm install
   npm run build:dev      # EAS build of the Android dev client
   npm start              # then open it on the phone
   ```
4. Checks:
   ```bash
   npm run typecheck
   npm test
   ```

## Not built (on purpose)

iOS (React Native makes it a build target, not a rewrite), WhatsApp integration, prescription OCR, escalation
ladders, and caring for more than one family from one account. See `docs/PRODUCT.md` for the full scope.

## Docs

- [`docs/PRODUCT.md`](docs/PRODUCT.md): problem, roles, flows and the dose state machine
- [`docs/SCHEMA.md`](docs/SCHEMA.md): tables, RLS, RPCs, alerts and push
- [`docs/DESIGN.md`](docs/DESIGN.md): design system and screen specs
- [`docs/DEMO.md`](docs/DEMO.md): the demo script
