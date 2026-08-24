# Khairiyat — Product spec

## Ninety days apart

> *A worldwide emergency has been declared. A pandemic is disrupting economies all around
> the globe and for the next ninety days people are not allowed to gather.*

Khairiyat was not redesigned for this. It is the condition the product already assumed,
made total: an aging parent alone in one city, adult children in another, and no way to
be in the same room. The gathering ban does not break the design — it removes the
fallback everyone was quietly relying on. You cannot drive down on Sunday and check the
pill box yourself.

Four consequences, and what each one is answered by:

| For ninety days | Consequence | Answer |
|---|---|---|
| No one may visit | Nobody sees the pill box | An NFC tap that needs no visitor and no shared surface |
| No one may gather to set it up | Someone must fix her phone remotely | The QR path: a token she can be sent, printed, or shown on a screen |
| Economies are disrupted | Pharmacy supply is unreliable and she cannot queue for it | Refill runway — days-until-empty, days in advance, so the family orders before it matters |
| Visits stop | Adherence still looks fine while nobody has heard her voice | The check-in nudge: the app tracks the call, because the call is now the visit |

The last one is the only thing the gathering ban added that was genuinely missing. A
dashboard of confirmed doses can be perfectly green while a person has not spoken to
anyone in three weeks. Doses were never the point; they were the proxy that a family
was paying attention. Take visiting away and the proxy comes apart, so the app measures
the thing directly — see `lib/checkin.ts`.

**What we did not do:** add a contact-tracing feature, a symptom log, a vaccination
card, or a case-count banner. None of them serve an eighty-year-old alone with a pill
box, and bolting on the vocabulary of a pandemic is not the same as answering the
constraint it imposes.

## The problem

Aging parents in India increasingly live alone while their adult children work in other
cities. Medication adherence is the daily failure point, and the failure is invisible:
nobody in the family knows a dose was skipped until something goes wrong.

Every existing pill reminder app notifies **the person who already forgot**. That is a
closed loop with no observer. Khairiyat's claim is that medication adherence is not a
reminder problem, it is a **visibility and routing problem** — the family, not the app,
is the intervention.

## The wedge

Three things that are not CRUD, all derived from tap timestamps:

1. **Unconfirmed as a first-class state.** "She took it and forgot to tap" is the
   failure mode that kills adherence apps. We never assert a dose was missed. We say
   there is no confirmation, and a caregiver resolves it after a phone call. Over time
   this separates *forgets pills* from *forgets to tap* — two different problems that no
   reminder app can distinguish.
2. **Adherence drift.** Doses sliding later week over week, one medication skipped far
   more than the others, weekend gaps. Behavioural analysis, not a log.
3. **Refill runway.** Doses logged against quantity dispensed gives days-until-empty.
   Running out of medication causes more missed doses in India than forgetting does.

## The physical product

The hero interaction is an **NFC sticker on the pill box**. The parent taps their phone
against it after taking a dose. The app launches from closed, logs the dose, shows a
full-screen confirmation, and closes itself out of the way.

This is deliberately a physical SKU: a branded Khairiyat pill-box sticker is something
the company would ship. The tag is not a gimmick, it is the product's surface.

**Input degradation stack** — build all four, in this order of priority:

1. NFC tap on the pill box (hero, requires NFC hardware)
2. In-app QR scan of the same sticker (demo fallback, works on every phone)
3. Big button in Simple Mode (floor — always works)
4. Reminder notification with a "Taken" action button (bonus, build only if time remains)

The tag and the QR encode the **same token**. One resolver handles both.

## Roles

Everyone uses the same app. A family member has one role:

- **Caregiver** — sees the whole family, adds members and medications, writes tags,
  resolves unconfirmed doses. This is the adult child.
- **Care recipient** — opens into Simple Mode: today's own doses only, huge type, one
  button per dose, no family data, no navigation. This is the parent.

The product is deliberately not elderly-only — any member can be tracked, any member can
be a caregiver. The pitch stays on the aging-parent story because that is the story with
stakes.

## Dose window state machine

A `dose_window` is one expected dose of one medication on one day. Windows are generated
lazily by an RPC when the app opens, not by a cron job.

```
                 ┌──────────────────────────────────────────┐
                 ▼                                          │
  scheduled ──► pending ──► confirmed          (tag tap, QR, or button)
                    │
                    └─────► unconfirmed ──► resolved_taken
                                       ├──► resolved_missed
                                       └──► resolved_unreachable
```

- `pending` — the window is open now (scheduled time ± grace).
- `confirmed` — a tap landed inside the window. Terminal.
- `unconfirmed` — the grace period elapsed with no tap. **Not "missed".** Surfaces to
  caregivers.
- `resolved_*` — a caregiver closed it manually after checking in.

Grace period: 60 minutes after scheduled time. A tap outside any open window attaches to
the nearest window within ±120 minutes; if none, it logs as an extra dose and is flagged.

Double-tap protection: a second tap within 10 minutes of a confirmation is ignored
silently, not counted twice.

## Flows

### Caregiver onboarding — must be under 90 seconds

The single most important flow in the app. It is what a judge will watch.

1. **Sign up** — email + password. Nothing else. No phone OTP, no verification email.
2. **Create family** — one field: family name ("Rana Family"). Creates the family and
   makes this user a caregiver member.
3. **Add members** — a single screen with an inline add row: name, role toggle
   (Caregiver / Care recipient). Add three people without leaving the screen. No modals,
   no wizard steps, no per-member forms.
4. **Add a medication** — pick the member, then: name, dose text ("5mg, 1 tablet"),
   times (chip picker: Morning / Afternoon / Night / custom time), quantity in hand.
   Times are chips, not a time-picker dialog per row — that is the friction that kills
   this screen.
5. **Done** — lands on the family dashboard, which now shows real dose windows.

The family code (6 characters) is shown persistently on the dashboard header so other
members can join. Joining = sign up, enter code, pick your name from the member list to
claim that profile.

### Writing a tag

From a member's medication list: "Set up pill box tag" → screen shows a large target,
hold the sticker to the phone, tag is written with `khairiyat://t/<token>`, success
confirmation. Same screen shows the matching QR code, printable/screenshot-able, for
phones without NFC.

A tag is bound to **one member and one medication**. Resolution picks the nearest dose
window for that medication.

### The tap (hero flow)

Parent taps phone to pill box sticker → Android launches Khairiyat via deep link →
`app/t/[token].tsx` resolves the token → confirms the nearest open window → haptic pulse
→ full-screen confirmation: a filled ring and the time in large numerals. Auto-dismisses
after 4 seconds into Simple Mode.

Must work when the app is fully closed. Must work with no session? No — the parent's
phone is signed in once during setup and stays signed in.

### Resolving an unconfirmed dose

Caregiver dashboard shows an unconfirmed dose card with the member's name and the time.
Tapping it opens a sheet with three actions, phrased as what the caregiver did:

- **She took it** → `resolved_taken`
- **She missed it** → `resolved_missed`
- **Couldn't reach her** → `resolved_unreachable`

Plus a "Call her" button that opens the dialer. The call is the feature; the app just
routes to it.

### Emergency info

One screen per care recipient: blood group, allergies, conditions, current medications
(auto-populated from the medication list), insurance, and every caregiver's phone number
as tap-to-call. Reachable in one tap from the member detail screen.

## Scope

**MUST — the demo dies without these**

- Auth, create family, add members, claim profile via family code
- Add medication with schedule and quantity
- Dose window generation
- Token resolution: NFC tap and QR scan
- Caregiver dashboard, live-updating
- Simple Mode
- Unconfirmed detection and resolution
- Light + dark theme

**SHOULD — build if the MUST list is done**

- Adherence drift on member detail
- Refill runway, and recording a refill when the box is topped up
- Emergency info screen
- Tag writing from inside the app (can be pre-written manually otherwise)
- Android home screen widget

**BUILT AFTER THE FACT — was on the WON'T list, is now real**

Both of these were correctly scoped out at the start and became necessary later. The
list is amended rather than quietly edited, because a doc that disagrees with the repo
is worse than a doc that changed its mind.

- **Push notifications between devices.** Originally "local scheduled notifications
  only", which was right while the demo was one person holding one phone. It stopped
  being right the moment the pitch became "a family in another city finds out without
  doing anything" — local notifications can only ever fire on the phone that already
  knows. A caregiver's device registers a push token; a scheduled sweep delivers.
  See **Alerts and push** in `docs/SCHEMA.md`.
- **Offline tap queue.** Not scoped at all originally. A tap with no network was lost
  outright, which is the worst failure the product has: she took the pill and her family
  is told nothing. Taps are now written to disk with the time they happened and replayed
  against that time, not the time of the sync.

**WON'T — do not build, do not discuss in the pitch as if built**

- WhatsApp integration of any kind
- Prescription OCR
- Escalation ladders / auto-reassignment
- iOS build (state as future scope — React Native makes it credible)
- Caring for more than one family from one account — `loadMember` takes the first
- Leaving a family, deleting an account, or releasing a wrongly claimed profile
- Mood tracking, chat, photo uploads, settings beyond theme
