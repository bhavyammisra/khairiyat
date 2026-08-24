import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, space, useTheme, type ColorToken } from '../../lib/theme';

type Props = {
  children: ReactNode;
  /** Scrolling is the default; turn it off for a screen that must not move. */
  scroll?: boolean;
  background?: ColorToken;
  /** Full-bleed screens — the tap confirmation — drop the horizontal padding. */
  bleed?: boolean;
  center?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Room for a fixed footer button to sit over. */
  footerSpace?: boolean;
};

export const Screen = ({
  children,
  scroll = true,
  background = 'bg',
  bleed = false,
  center = false,
  refreshing,
  onRefresh,
  footerSpace = false,
}: Props) => {
  const { color } = useTheme();
  const insets = useSafeAreaInsets();

  const padding = {
    paddingHorizontal: bleed ? 0 : layout.screenX,
    paddingTop: insets.top + space[4],
    paddingBottom: insets.bottom + (footerSpace ? space[9] : space[6]),
  };

  const root = { flex: 1, backgroundColor: color[background] };
  const centred = center
    ? ({ justifyContent: 'center', alignItems: 'center' } as const)
    : undefined;

  if (!scroll) {
    return <View style={[root, padding, centred]}>{children}</View>;
  }

  return (
    <ScrollView
      style={root}
      contentContainerStyle={[padding, center && { flexGrow: 1 }, centred]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={color.textMuted}
            colors={[color.accent]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
};
