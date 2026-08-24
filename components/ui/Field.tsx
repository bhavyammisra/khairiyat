import { TextInput, View, type TextInputProps } from 'react-native';

import { layout, radius, space, touch, typeScale, useTheme } from '../../lib/theme';
import { Text } from './Text';

type Props = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  label?: string;
  /** Shown under the field. Say what happened and what to do. */
  hint?: string;
  invalid?: boolean;
};

export const Field = ({ label, hint, invalid = false, ...rest }: Props) => {
  const { color } = useTheme();

  return (
    <View style={{ gap: space[2] }}>
      {label ? (
        <Text variant="label" color="textSecondary">
          {label}
        </Text>
      ) : null}

      <TextInput
        {...rest}
        placeholderTextColor={color.textMuted}
        style={[
          typeScale.body,
          {
            color: color.textPrimary,
            backgroundColor: color.surfaceRaised,
            borderColor: invalid ? color.red : color.border,
            borderWidth: layout.hairline,
            borderRadius: radius.sm,
            paddingHorizontal: space[4],
            paddingVertical: space[3],
            minHeight: touch.min,
          },
        ]}
      />

      {hint ? (
        <Text variant="caption" color={invalid ? 'red' : 'textMuted'}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
};
