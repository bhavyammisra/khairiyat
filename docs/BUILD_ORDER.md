# Khairiyat — Build runbook

Built solo, roughly twelve hours. Hours are relative to kickoff (H0), not clock time.
The ordering exists to make the riskiest things fail early, while there is still time to
route around them.

Because there is one implementer, the timeline below is a single serial track. Do the
steps in the order written — the order *is* the dependency graph. When something is
blocking on a human action (an EAS build, a SQL paste), start it and move down the list
rather than waiting on it.

## H0 — Do these before writing any feature code (30 min)

Blocking checklist. Nothing else starts until all five are green.

1. **Confirm the demo phone has NFC.** Settings → search "NFC". If it isn't there, the
   hero interaction cannot be demoed on that device — find another phone now, and if
   there isn't one, promote QR to the demo path and say so in the pitch.
2. **Create the Supabase project.** Copy the URL and anon key into `.env`.
3. **Scaffold and freeze native modules.** `npx create-expo-app@latest` with the
   TypeScript template, then install the entire frozen list from `CLAUDE.md` in one go
   and configure their Expo plugins in `app.json`. Getting this wrong costs a rebuild.
4. **Configure `eas.json` to output an APK, not an AAB.** On the `development` profile:
   `"developmentClient": true`, `"distribution": "internal"`,
   `"android": { "buildType": "apk" }`. An APK sideloads onto a borrowed phone in two
   minutes; an AAB does not.
5. **Start the EAS build and do not wait for it.** Move on to schema and UI work while it
   runs. Install it on **two** phones the moment it lands.

Also add the deep link intent filter for `khairiyat` in `app.json` now, in this same
build. Adding it later costs another 15 minutes.

## Timeline

**H0–H1 · Foundations**
`lib/theme.ts` and the UI primitives (`Text` / `Button` / `Card` / `Screen` / `DoseRing`)
come **first**, with fonts loading. Every screen depends on them, so nothing visual starts
until they exist — that is the one hard ordering dependency in the whole plan. Then
tables + enums + RLS, then the Supabase client, auth screens and session persistence with
AsyncStorage.

**H1–H3 · The spine**
`ensure_dose_windows`, `mark_stale_unconfirmed`, `resolve_tag`, seed script. Then create
family, add members, claim profile, add medication. Then the deep link route
`app/t/[token].tsx` and the QR scanner, both calling `resolve_tag`.

> **Gate at H3.** A QR scan must produce a confirmed dose visible in the Supabase table.
> If this isn't working, stop all other work and fix it. It is the entire product.

**H3–H5 · The screens that get demoed**
Caregiver dashboard with realtime and the attention section, then Simple Mode and the
full-screen tap confirmation, then `lib/doses.ts` — adherence, drift, runway.

**H5–H6 · NFC**
`lib/nfc.ts` read + write, tag setup screen. Test on the physical device continuously;
this is the only part of the build with no simulator.

> **Gate at H6.** Tap a written tag with the app closed → app launches → dose confirms →
> dashboard updates on a second device. This is the demo. Everything after is upside.

**H6–H8 · Depth**
Seed 21 days of backdated windows and tune the drift sentence until it reads well. Then
member detail — adherence grid, runway, drift card, resolve sheet, emergency info. Then
notification channel + scheduled reminders and the dark/light toggle in settings.

**H8–H10 · Widget (hard cutoff at H10)**
App writes today's summary to AsyncStorage on foreground; `react-native-android-widget`
task handler renders family name, member name and today's dose rings. No interaction, no
navigation, refresh on a 30-minute timer.
**At H10 it either works or it is deleted from the build and moved to future scope.**

**H10–H11 · Polish**
Empty states, loading states, error states, dark mode audit on every screen, copy pass
against `.claude/rules/ui.md`. Delete every `console.log` and every placeholder string.
This hour is why it will look finished.

**H11–H12 · Demo lock**
Two full dry runs. Screen-record a complete successful run as backup. Freeze the code —
no commits after the first clean dry run except to fix something the dry run broke.

## Demo mechanics to prepare during H11

- **scrcpy** on the Windows laptop (standalone binary, no Android Studio) to mirror the
  demo phone over USB onto the projector.
- Both phones on airplane mode + hotspot, not venue wifi.
- The parent account signed in on the NFC-capable phone; the caregiver account on the
  borrowed phone.
- The written tag stuck to a real pill box you bring with you.
- The backup screen recording on the laptop, one click from playing.

## Cut list

If you fall behind, cut in this exact order. Everything here is already scoped out of
the demo script so cutting costs nothing on stage.

1. Widget
2. Notification reminders
3. Emergency info screen
4. Tag writing in-app (pre-write the tag with a free NFC Tools app instead)
5. Adherence grid on member detail (keep the drift sentence — it is worth more)
6. Refill runway

**Never cut:** theme correctness, Simple Mode, the tap confirmation screen, realtime on
the dashboard. Those four are the demo.

## Things that will waste your night if you let them

- Rebuilding the dev client. Freeze native modules at H0 and mean it.
- Chasing RLS errors during the join-family flow. Use the `security definer` RPC.
- Building a settings screen with more than three rows.
- Perfecting the drift algorithm. It needs to produce one true sentence, not a model.
- Testing NFC on an emulator. It does not exist.
