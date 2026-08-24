import { FlexWidget, TextWidget, type ColorProp } from 'react-native-android-widget';

import { palette, radius, space, type ColorScheme } from '../lib/theme';

/**
 * A one-tap shortcut straight to the scanner. Opening the app and navigating
 * to the scanner is two steps too many when someone is standing at the pill
 * box with the phone already in hand.
 *
 * Deep-links to khairiyat://scan, which expo-router resolves to
 * app/(caregiver)/scan.tsx — group folders add no path segment.
 */
const hex = (value: string): ColorProp => value as ColorProp;

export function ScanWidget({ scheme = 'light' }: { scheme?: ColorScheme }) {
  const color = palette[scheme];

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'khairiyat://scan' }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: hex(color.accent),
        borderRadius: radius.lg,
        paddingLeft: space[3],
        paddingRight: space[3],
        paddingTop: space[3],
        paddingBottom: space[3],
      }}
    >
      <TextWidget text="▣" style={{ fontSize: 30, color: hex(color.onAccent) }} />
      <TextWidget
        text="Scan a pill box"
        style={{ fontSize: 13, color: hex(color.onAccent), marginTop: space[1] }}
      />
    </FlexWidget>
  );
}
