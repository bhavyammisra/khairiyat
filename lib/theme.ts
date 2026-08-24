/**
 * Design tokens. The single source of truth for colour, type, spacing, radius.
 *
 * Nothing in `app/` or `components/` may hardcode a colour, font size, radius
 * or spacing value. A single stray `#fff` breaks dark mode invisibly, and dark
 * mode gets shown on stage.
 *
 * Values transcribed from docs/DESIGN.md. Do not improvise around them.
 */

import { createContext, useContext } from "react";
import type { TextStyle } from "react-native";

/* -------------------------------------------------------------------------- */
/* Colour                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The brand colour and the "dose taken" colour are the same pine green, and
 * nothing else in the app is allowed to be green. That discipline is what stops
 * this looking like every other health app.
 *
 * Amber and red are semantic only — unconfirmed and missed. Never decorative.
 */
const light = {
  bg: "#FAF9F5",
  surface: "#FFFFFF",
  surfaceRaised: "#F1EFE8",
  border: "#E2DFD5",
  borderStrong: "#CDC9BC",
  textPrimary: "#22211F",
  textSecondary: "#55524B",
  textMuted: "#838078",
  accent: "#2F6B4F",
  accentSurface: "#E6F0E9",
  amber: "#92650B",
  amberSurface: "#F7EFDC",
  red: "#983A31",
  redSurface: "#F8E8E5",
  /** Text that sits on top of `accent` — buttons, the check inside a filled ring. */
  onAccent: "#FAF9F5",
} as const;

/** Warm near-black neutrals. Brown-grey, never pure black and never blue-grey. */
const dark: Record<keyof typeof light, string> = {
  bg: "#111111",
  surface: "#262624",
  surfaceRaised: "#302F2D",
  border: "#3D3B37",
  borderStrong: "#4E4C47",
  textPrimary: "#F5F4EF",
  textSecondary: "#A8A59C",
  textMuted: "#7A7770",
  accent: "#6BAE87",
  accentSurface: "#22322A",
  amber: "#E0A64B",
  amberSurface: "#322815",
  red: "#E0736A",
  redSurface: "#331F1C",
  onAccent: "#1F1E1D",
};

export const palette = { light, dark } as const;

export type ColorScheme = keyof typeof palette;
export type ColorToken = keyof typeof light;
export type Colors = Record<ColorToken, string>;

/* -------------------------------------------------------------------------- */
/* Type                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Fraunces is used ONLY for screen titles, member names and large numerals.
 * Its scarcity is the point — if it appears on more than ~3 elements on a
 * screen, it has been overused. Inter is everything else.
 */
export const fontFamily = {
  fraunces: "Fraunces_600SemiBold",
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
} as const;

/** Line height is 1.45x for body, 1.15x for display and titles. */
const body = (size: number) => Math.round(size * 1.45);
const tight = (size: number) => Math.round(size * 1.15);

/** Times, counts and countdowns must not jitter as they update. */
const tabular: Pick<TextStyle, "fontVariant"> = {
  fontVariant: ["tabular-nums"],
};

export const typeScale = {
  /** Confirmation numerals, day counts. */
  display: {
    fontFamily: fontFamily.fraunces,
    fontSize: 44,
    lineHeight: tight(44),
    ...tabular,
  },
  /** Screen titles. */
  title: {
    fontFamily: fontFamily.fraunces,
    fontSize: 30,
    lineHeight: tight(30),
  },
  /** Member names on cards. */
  name: {
    fontFamily: fontFamily.fraunces,
    fontSize: 22,
    lineHeight: tight(22),
  },
  /** Section headings. */
  heading: {
    fontFamily: fontFamily.semibold,
    fontSize: 22,
    lineHeight: body(22),
  },
  /** Default body text. 17 is the floor for anything readable. */
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 17,
    lineHeight: body(17),
  },
  bodyStrong: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    lineHeight: body(17),
  },
  /** Form labels, button text. */
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    lineHeight: body(15),
  },
  /** Timestamps, helper text. Never body copy. */
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: body(13),
  },
  /** Small section labels. The only place uppercase is allowed. */
  eyebrow: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    lineHeight: body(12),
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
  },

  /* Simple Mode — care recipients only. Nothing below 22. */
  simpleTitle: {
    fontFamily: fontFamily.fraunces,
    fontSize: 34,
    lineHeight: tight(34),
  },
  simpleBody: {
    fontFamily: fontFamily.medium,
    fontSize: 24,
    lineHeight: body(24),
  },
  simpleNumeral: {
    fontFamily: fontFamily.fraunces,
    fontSize: 64,
    lineHeight: tight(64),
    ...tabular,
  },
} satisfies Record<string, TextStyle>;

export type TypeToken = keyof typeof typeScale;

/* -------------------------------------------------------------------------- */
/* Space, shape, targets                                                       */
/* -------------------------------------------------------------------------- */

/** Nothing else. No arbitrary pixel margins. */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
  9: 56,
} as const;

export type SpaceToken = keyof typeof space;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  full: 999,
} as const;

export const layout = {
  /** Screen horizontal padding. */
  screenX: space[5],
  /** Card padding. */
  cardPad: space[5],
  /** Gap between cards. */
  cardGap: space[3],
  /** Hairline. There are no drop shadows in this app — separation is by
   *  surface colour and a 1px border only. Shadows are the fastest way to make
   *  a React Native app look templated. */
  hairline: 1,
} as const;

export const touch = {
  /** Minimum touch target. */
  min: 48,
  /** Minimum touch target in Simple Mode. */
  simple: 64,
} as const;

/** Restrained. Confirmation, dose row entry, sheet. Nothing loops or pulses. */
export const motion = {
  confirmSpringMs: 320,
  rowStaggerMs: 40,
  rowRisePx: 12,
  confirmationDismissMs: 4000,
} as const;

/* -------------------------------------------------------------------------- */
/* Theme access                                                                */
/* -------------------------------------------------------------------------- */

/** What the user picked in Settings. `system` follows the OS. */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "khairiyat.theme";

export type Theme = {
  scheme: ColorScheme;
  color: Colors;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
};

export const ThemeContext = createContext<Theme>({
  scheme: "light",
  color: light,
  preference: "system",
  setPreference: () => undefined,
});

export const useTheme = (): Theme => useContext(ThemeContext);
