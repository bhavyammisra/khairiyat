import { Image } from 'react-native';

import { useTheme } from '../../lib/theme';

/**
 * The brand wordmark — Devanagari खै fused into Latin "riyat.", which carries
 * the domestic, Urdu/Hindi warmth the product is named for far better than
 * setting the name in Fraunces did.
 *
 * Both files are transparent monochrome, so the mark flips with the theme
 * instead of sitting in a box. Source art is 2172x724.
 */
const RATIO = 724 / 2172;

const BLACK = require('../../assets/khairiyat_black_wordmark.png') as number;
const WHITE = require('../../assets/khairiyat_white_wordmark.png') as number;

export const Wordmark = ({ width = 180 }: { width?: number }) => {
  const { scheme } = useTheme();

  return (
    <Image
      source={scheme === 'dark' ? WHITE : BLACK}
      accessibilityLabel="Khairiyat"
      resizeMode="contain"
      style={{ width, height: width * RATIO }}
    />
  );
};
