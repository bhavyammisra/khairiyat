import { View } from 'react-native';

import { layout, radius, useTheme } from '../../lib/theme';
import { Text } from './Text';

type Props = {
  name: string;
  size?: number;
  selected?: boolean;
};

const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();

export const Avatar = ({ name, size = 48, selected = false }: Props) => {
  const { color } = useTheme();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: selected ? color.accent : color.surfaceRaised,
        borderColor: selected ? color.accent : color.border,
        borderWidth: layout.hairline,
      }}
    >
      <Text variant="label" color={selected ? 'onAccent' : 'textSecondary'}>
        {initials(name)}
      </Text>
    </View>
  );
};
