import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { useTheme, type ColorToken } from '../../lib/theme';

/**
 * Hand-drawn in react-native-svg rather than pulling in an icon font — the
 * native module list is frozen, and three glyphs do not justify a rebuild.
 *
 * Geometry is authored in a 24-unit box and scales with `size`.
 */
export type IconName = 'gear' | 'qr' | 'chevronLeft';

type Props = {
  name: IconName;
  size?: number;
  color?: ColorToken;
};

const TEETH = [0, 45, 90, 135, 180, 225, 270, 315];

export const Icon = ({ name, size = 24, color = 'textPrimary' }: Props) => {
  const theme = useTheme();
  const stroke = theme.color[color];

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'gear' && (
        <>
          <Circle cx={12} cy={12} r={3.2} stroke={stroke} strokeWidth={1.7} />
          <Circle cx={12} cy={12} r={7} stroke={stroke} strokeWidth={1.7} />
          {TEETH.map((deg) => {
            const rad = (deg * Math.PI) / 180;
            return (
              <Line
                key={deg}
                x1={12 + 7 * Math.cos(rad)}
                y1={12 + 7 * Math.sin(rad)}
                x2={12 + 10 * Math.cos(rad)}
                y2={12 + 10 * Math.sin(rad)}
                stroke={stroke}
                strokeWidth={1.7}
                strokeLinecap="round"
              />
            );
          })}
        </>
      )}

      {name === 'qr' && (
        <>
          {/* Three finder squares, like a real QR code. */}
          {[
            [3, 3],
            [14, 3],
            [3, 14],
          ].map(([x, y]) => (
            <Rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={7}
              height={7}
              rx={1.6}
              stroke={stroke}
              strokeWidth={1.7}
            />
          ))}
          {[
            [5.6, 5.6],
            [16.6, 5.6],
            [5.6, 16.6],
          ].map(([x, y]) => (
            <Rect key={`d-${x}-${y}`} x={x} y={y} width={1.8} height={1.8} fill={stroke} />
          ))}
          {/* Data cells */}
          <Rect x={14} y={14} width={3} height={3} fill={stroke} />
          <Rect x={18.5} y={14} width={2.2} height={2.2} fill={stroke} />
          <Rect x={14} y={18.5} width={2.2} height={2.2} fill={stroke} />
          <Rect x={18} y={18} width={3} height={3} fill={stroke} />
        </>
      )}

      {name === 'chevronLeft' && (
        <Path
          d="M14.5 5.5 L8 12 L14.5 18.5"
          stroke={stroke}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
};
