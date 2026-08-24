import { Pressable, View } from 'react-native';

import { layout, radius, space, touch, useTheme } from '../../lib/theme';
import { Text } from './Text';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

export const Segmented = <T extends string>({ options, value, onChange }: Props<T>) => {
  const { color } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: color.surfaceRaised,
        borderColor: color.border,
        borderWidth: layout.hairline,
        borderRadius: radius.full,
        padding: space[1],
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: touch.min - space[2],
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: space[3],
              borderRadius: radius.full,
              backgroundColor: selected ? color.accent : 'transparent',
            }}
          >
            <Text variant="label" color={selected ? 'onAccent' : 'textSecondary'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};
