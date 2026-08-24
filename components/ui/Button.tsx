import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';

import { radius, space, touch, useTheme, type ColorToken } from '../../lib/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

type Props = {
  /** Buttons name the outcome: "Save medication", not "Submit". */
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Simple Mode targets are 64dp and the text is 24pt. */
  simple?: boolean;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
  /** Sits before the label. Inherits the button's foreground colour. */
  icon?: IconName;
  style?: ViewStyle;
};

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  simple = false,
  disabled = false,
  loading = false,
  full = false,
  icon,
  style,
}: Props) => {
  const { color } = useTheme();

  const background: Record<ButtonVariant, ColorToken | 'transparent'> = {
    primary: 'accent',
    secondary: 'surfaceRaised',
    quiet: 'transparent',
  };

  const foreground: Record<ButtonVariant, ColorToken> = {
    primary: 'onAccent',
    secondary: 'textPrimary',
    quiet: 'accent',
  };

  const bg = background[variant];
  const inactive = disabled || loading;

  const base: ViewStyle = {
    minHeight: simple ? touch.simple : touch.min,
    paddingHorizontal: space[5],
    paddingVertical: simple ? space[4] : space[3],
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: bg === 'transparent' ? 'transparent' : color[bg],
    alignSelf: full ? 'stretch' : 'flex-start',
    opacity: inactive ? 0.45 : 1,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        base,
        pressed && variant !== 'primary' && { backgroundColor: color.surfaceRaised },
        pressed && variant === 'primary' && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <View style={{ height: simple ? space[7] : space[6], justifyContent: 'center' }}>
          <ActivityIndicator color={color[foreground[variant]]} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          {icon ? (
            <Icon name={icon} size={simple ? space[6] : space[5]} color={foreground[variant]} />
          ) : null}
          <Text variant={simple ? 'simpleBody' : 'label'} color={foreground[variant]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
};
