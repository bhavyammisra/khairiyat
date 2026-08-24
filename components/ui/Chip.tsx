import { Pressable } from 'react-native';

import { layout, radius, space, touch, useTheme } from '../../lib/theme';
import { Text } from './Text';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

/**
 * Time chips toggle on tap. Never open a time-picker dialog per row — that
 * friction is what makes the add-medication screen fail.
 */
export const Chip = ({ label, selected, onPress }: Props) => {
  const { color } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: touch.min,
        justifyContent: 'center',
        paddingHorizontal: space[4],
        borderRadius: radius.full,
        borderWidth: layout.hairline,
        backgroundColor: selected ? color.accentSurface : color.surfaceRaised,
        borderColor: selected ? color.accent : color.border,
      }}
    >
      <Text variant="label" color={selected ? 'accent' : 'textSecondary'}>
        {label}
      </Text>
    </Pressable>
  );
};
