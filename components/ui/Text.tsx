import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { typeScale, useTheme, type ColorToken, type TypeToken } from '../../lib/theme';

type Props = Omit<RNTextProps, 'style'> & {
  variant?: TypeToken;
  color?: ColorToken;
  /** Only for layout — margins and alignment. Never colour or size. */
  style?: RNTextProps['style'];
};

/**
 * Always import Text from here, never from react-native. This wrapper applies
 * the type scale and font family; the raw one does not, and a screen that uses
 * the raw one silently drops out of the type system.
 */
export const Text = ({ variant = 'body', color = 'textPrimary', style, ...rest }: Props) => {
  const theme = useTheme();

  return <RNText {...rest} style={[typeScale[variant], { color: theme.color[color] }, style]} />;
};
