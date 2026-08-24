import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { layout, radius, useTheme, type ColorToken } from '../../lib/theme';

/** Amber and red are semantic only — unconfirmed and missed. Never decorative. */
export type CardTone = 'surface' | 'accent' | 'amber' | 'red';

const tones: Record<CardTone, { bg: ColorToken; border: ColorToken }> = {
  surface: { bg: 'surface', border: 'border' },
  accent: { bg: 'accentSurface', border: 'accentSurface' },
  amber: { bg: 'amberSurface', border: 'amberSurface' },
  red: { bg: 'redSurface', border: 'redSurface' },
};

type Props = {
  children: ReactNode;
  tone?: CardTone;
  onPress?: () => void;
  /** Layout only — never colour, size or radius. */
  style?: ViewStyle;
};

/**
 * No drop shadows anywhere in this app. Separation is by surface colour and a
 * 1px hairline border only — shadows are the fastest way to make a React
 * Native app look templated.
 */
export const Card = ({ children, tone = 'surface', onPress, style }: Props) => {
  const { color } = useTheme();
  const palette = tones[tone];

  const base: ViewStyle = {
    backgroundColor: color[palette.bg],
    borderColor: color[palette.border],
    borderWidth: layout.hairline,
    borderRadius: radius.md,
    padding: layout.cardPad,
  };

  if (!onPress) {
    return <View style={[base, style]}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        base,
        pressed && { backgroundColor: color.surfaceRaised },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
};
