# Khairiyat — Design

The app must look designed, not assembled. Judges see the screen before they hear the
pitch. Every rule below is load-bearing; do not improvise around them.

## Direction

Warm, quiet, domestic. This is a family object, not a hospital instrument — so no
clinical blue, no gradient cards, no glassmorphism, no icon soup. The interface is mostly
empty space, warm neutrals, and one green.

**The thesis: the brand colour and the "dose taken" colour are the same pine green.**
The entire product exists to produce that one confirmation, so green *is* the identity.
Nothing else in the app is allowed to be green. That discipline is what stops it looking
like every other health app.

**Signature element: the Dose Ring.** A circular indicator, 1 per dose, that reads at a
glance from arm's length and encodes state in *shape* as well as colour:

- `pending` — hollow ring, 2px `borderStrong` stroke
- `confirmed` — solid filled disc, `accent`, with a white check
- `unconfirmed` — hollow ring, 2px `amber` stroke, small amber dot at centre
- `resolved_taken` — filled disc, `accent` at 45% opacity (taken, but not self-confirmed)
- `resolved_missed` — hollow ring, `red` stroke, with a diagonal slash
- `resolved_unreachable` — hollow ring, `textMuted` stroke, dashed

A member's day is a horizontal row of these rings. That row is the whole product in one
glance and it is what goes on the widget.

## Colour tokens

Define in `lib/theme.ts` as `{ light, dark }` pairs. Dark values are Claude's warm
near-black neutrals — brown-grey, never pure black or blue-grey.

### Dark

| Token | Hex | Use |
|---|---|---|
| `bg` | `#1F1E1D` | screen background |
| `surface` | `#262624` | cards |
| `surfaceRaised` | `#302F2D` | sheets, inputs, pressed states |
| `border` | `#3D3B37` | hairlines |
| `borderStrong` | `#4E4C47` | pending ring stroke, dividers that matter |
| `textPrimary` | `#F5F4EF` | body and headings |
| `textSecondary` | `#A8A59C` | supporting text |
| `textMuted` | `#7A7770` | captions, timestamps |
| `accent` | `#6BAE87` | confirmed, primary buttons |
| `accentSurface` | `#22322A` | accent-tinted card backgrounds |
| `amber` | `#E0A64B` | unconfirmed |
| `amberSurface` | `#322815` | unconfirmed card background |
| `red` | `#E0736A` | missed |
| `redSurface` | `#331F1C` | missed card background |

### Light

| Token | Hex | Use |
|---|---|---|
| `bg` | `#FAF9F5` | screen background (off-white, never pure white) |
| `surface` | `#FFFFFF` | cards |
| `surfaceRaised` | `#F1EFE8` | inputs, sheets, pressed states |
| `border` | `#E2DFD5` | hairlines |
| `borderStrong` | `#CDC9BC` | pending ring stroke |
| `textPrimary` | `#22211F` | body and headings |
| `textSecondary` | `#55524B` | supporting text |
| `textMuted` | `#838078` | captions only — never body text |
| `accent` | `#2F6B4F` | confirmed, primary buttons |
| `accentSurface` | `#E6F0E9` | accent-tinted card backgrounds |
| `amber` | `#92650B` | unconfirmed |
| `amberSurface` | `#F7EFDC` | unconfirmed card background |
| `red` | `#983A31` | missed |
| `redSurface` | `#F8E8E5` | missed card background |

Theme resolves from system preference by default, overridable in Settings, persisted to
AsyncStorage. Both themes must be visually finished — dark mode is not an afterthought
and will be shown on stage.

## Typography

Two families, loaded via `@expo-google-fonts`:

- **Fraunces** — serif, warm, optical. Used *only* for screen titles, member names, and
  large numerals. Its scarcity is the point; if it appears on more than ~3 elements per
  screen, you have overused it.
- **Inter** — everything else.

| Token | Size | Family / weight | Use |
|---|---|---|---|
| `display` | 44 | Fraunces 600 | confirmation numerals, day counts |
| `title` | 30 | Fraunces 600 | screen titles |
| `name` | 22 | Fraunces 600 | member names on cards |
| `heading` | 22 | Inter 600 | section headings |
| `body` | 17 | Inter 400 | default body — the floor for readable text |
| `bodyStrong` | 17 | Inter 600 | emphasis in body |
| `label` | 15 | Inter 500 | form labels, button text |
| `caption` | 13 | Inter 500 | timestamps, helper text |
| `eyebrow` | 12 | Inter 600, uppercase, +1.2 tracking | small section labels |

Simple Mode overrides — care recipients only:

| Token | Size | Family |
|---|---|---|
| `simpleTitle` | 34 | Fraunces 600 |
| `simpleBody` | 24 | Inter 500 |
| `simpleNumeral` | 64 | Fraunces 600 |

Line height is 1.45× for body, 1.15× for display and titles. All numerals in times,
counts and countdowns use `fontVariant: ['tabular-nums']`.

## Spacing, shape, elevation

- `space`: `1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 7:32, 8:40, 9:56`. Nothing else.
- Screen horizontal padding: `space[5]` (20).
- Card padding: `space[5]`. Gap between cards: `space[3]`.
- Radius: `sm: 10`, `md: 16`, `lg: 22`, `full: 999`. Cards use `md`, sheets use `lg`,
  buttons use `full`.
- **No drop shadows.** Separation is by surface colour and 1px hairline border only.
  Shadows are the fastest way to make a React Native app look templated.
- Touch targets: 48dp minimum, 64dp in Simple Mode.

## Motion

Restrained. Three moments only:

1. **Confirmation** — the Dose Ring fills with a 320ms spring, paired with
   `Haptics.notificationAsync(Success)`. This is the emotional beat of the entire app.
2. **Dose row entry** — cards fade+rise 12px, staggered 40ms, on dashboard mount. Once.
3. **Sheet** — standard slide-up.

Nothing loops, nothing pulses, nothing shimmers. Respect `prefers-reduced-motion` by
skipping 1 and 2 (keep the haptic).

## Screens

### Auth (`app/(auth)/`)

Full-bleed `bg`. Title in Fraunces, one supporting line, two fields, one primary button.
No logo image, no illustration, no hero graphic — a wordmark set in Fraunces is the
identity. Sign-in and sign-up are one screen with a toggle at the bottom.

### Create / join family

Create: one field (family name), one button. Join: 6-character code input rendered as six
separate boxes, then a list of unclaimed member names to pick from.

### Add members

Single screen, no wizard. A list of added members with an always-visible inline add row
at the bottom: name field + role segmented control + add button. Members appear
immediately in the list above. "Continue" is a fixed footer button.

### Add medication

Member selector (avatar row, tap to select) → name field → dose text field → **time
chips**: Morning 8:00 / Afternoon 2:00 / Night 9:00 / + Custom. Chips toggle on tap.
Never open a time-picker dialog per row — that friction is what makes this screen fail.
Then quantity in hand (numeric) and "Save medication".

### Caregiver dashboard (`app/(caregiver)/home.tsx`)

The screen judges will look at longest.

```
┌────────────────────────────────────────┐
│ Rana Family                    ⚙       │   title (Fraunces), settings icon
│ Code · 7K2M9P                          │   caption, tappable to copy
│                                        │
│ NEEDS ATTENTION                        │   eyebrow, only if count > 0
│ ┌────────────────────────────────────┐ │
│ │ ◯ Amma · Amlodipine                │ │   amberSurface card
│ │   No confirmation for 9:00 AM      │ │
│ │   [ Call Amma ]   [ Resolve ]      │ │
│ └────────────────────────────────────┘ │
│                                        │
│ TODAY                                  │   eyebrow
│ ┌────────────────────────────────────┐ │
│ │ Amma                    ● ● ◯      │ │   name (Fraunces 22) + dose rings
│ │ 3 doses · 2 confirmed              │ │   caption
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │ Papa                    ● ●        │ │
│ │ 2 doses · all confirmed            │ │
│ └────────────────────────────────────┘ │
└────────────────────────────────────────┘
```

Attention section is absent entirely when empty — not an empty state. Live-updates via
Supabase realtime; a ring filling while the judge watches is the demo.

### Member detail

Member name in Fraunces as the screen title. Then: today's rings large, the medication
list with refill runway per medication ("14 days left", amber under 5), a 14-day
adherence grid (rows = medication, columns = day, cells = small rings), and the drift
insight rendered as a single sentence in `bodyStrong` inside an `accentSurface` card:
*"The evening dose has moved 40 minutes later over the last three weeks."*
Emergency info is a full-width row at the bottom.

### Simple Mode (`app/(simple)/home.tsx`)

The parent's entire app. No tabs, no back button, no navigation.

```
┌────────────────────────────────────────┐
│                                        │
│ Good morning,                          │   simpleBody, textSecondary
│ Sunita                                 │   simpleTitle, Fraunces
│                                        │
│ ┌────────────────────────────────────┐ │
│ │  ●   Amlodipine                    │ │   64dp ring, simpleBody
│ │      8:00 AM · taken                │ │
│ └────────────────────────────────────┘ │
│ ┌────────────────────────────────────┐ │
│ │  ◯   Metformin                     │ │
│ │      9:00 PM                        │ │
│ │      [   I took this   ]            │ │   64dp full-width button
│ └────────────────────────────────────┘ │
│                                        │
└────────────────────────────────────────┘
```

No family data, no other members, nothing to get lost in.

### Tap confirmation (`app/t/[token].tsx`)

Full screen, `accentSurface` background, no chrome. A large Dose Ring animating to
filled, the medication name in `name`, and the time in `display` numerals. Auto-dismiss
to Simple Mode after 4s with a "Done" button for impatience. Failure states get the same
full-screen treatment in `redSurface` with a plain explanation and a manual-log button —
never a toast, never an alert dialog.

### Tag setup

Large concentric-circle target graphic (SVG, `borderStrong`), instruction line, live
status. On success, swap to a filled accent ring and the written token. QR code for the
same token rendered below with a "Show QR instead" affordance.

### Settings

Theme (System / Light / Dark) as a segmented control, family code, sign out. Nothing
else. A short settings screen reads as confidence, not as missing work.

## Copy voice

Plain, warm, never clinical, never cute. Sentence case. Buttons name outcomes.

- Never blame: "No confirmation yet", never "Amma missed her dose".
- Never expose the model: say "dose", "medication", "family" — never "record", "entry",
  "sync", "user".
- Empty states instruct rather than apologise: "No medications yet. Add the first one to
  start tracking."
- Errors say what happened and what to do: "Couldn't read that tag. Hold the phone
  against the sticker for a second longer, or log it manually."
