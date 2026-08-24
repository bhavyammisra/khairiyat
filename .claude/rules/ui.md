---
paths: ["app/**", "components/**", "lib/theme.ts"]
---

# UI rules

Full spec in `docs/DESIGN.md`. These are the rules that apply to every UI file.

## Non-negotiable

- Every colour, font size, weight, radius and spacing value comes from `lib/theme.ts`.
  No literals. Not even `#fff`, not even `padding: 16`.
- Both themes must be correct at all times. If you add a colour token, add both the
  `light` and `dark` value in the same edit.
- Minimum body text is 17pt. Minimum any text is 13pt. Simple Mode minimum is 22pt.
- Minimum touch target is 48dp. In Simple Mode it is 64dp.
- Never convey a dose state by colour alone — always pair it with a shape (filled ring,
  hollow ring, ring with a slash) and a text label. Older eyes and colour-blind judges
  both need this.

## Type

- Fraunces (serif) is used **only** for: screen titles, member names, and large numerals
  (times, day counts). Nothing else, ever. Its restraint is what makes it work.
- Inter is everything else.
- Numerals in any table, time or countdown use `fontVariant: ['tabular-nums']` so they
  don't jitter on update.

## Components

- Compose from `components/ui` primitives. If a screen needs a new visual pattern,
  add a primitive rather than styling inline in the screen.
- One accent colour exists (`theme.color.accent`, pine green) and it means "confirmed /
  primary action". Do not introduce a second brand colour.
- Amber and red are semantic only — unconfirmed and missed. Never decorative.

## Copy

- Sentence case everywhere. No title case, no ALL CAPS except small eyebrow labels.
- Buttons name the outcome: "Save medication", not "Submit".
- Empty states instruct: "No medications yet. Add the first one to start tracking."
- Never say "user", "record", "sync" or "entry" in user-facing text. Say the person's
  name, "dose", "medication".
- Never blame the parent in copy. "No confirmation yet" — never "Mum missed her dose".
  The app does not know that, and the tone matters to the pitch.
