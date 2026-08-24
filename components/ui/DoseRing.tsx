import Svg, { Circle, Path } from 'react-native-svg';

import { doseStateLabel } from '../../lib/doses';
import { useTheme } from '../../lib/theme';
import type { DoseState } from '../../lib/types';

/**
 * The signature element. One ring per dose, readable at a glance from arm's
 * length, encoding state in SHAPE as well as colour — hollow, filled, dotted,
 * slashed, dashed.
 *
 * Never rely on the colour alone. Older eyes and colour-blind judges both need
 * the shape, and the containing screen must still pair this with a text label.
 *
 * Geometry is authored in a 24-unit box and scaled by `size`, so the same
 * component serves the 12dp adherence grid cell, the dashboard row, the 64dp
 * Simple Mode cell and the full-screen confirmation.
 */
type Props = {
  state: DoseState;
  size?: number;
  /**
   * What a screen reader says. Defaults to the same words the sighted label
   * uses, so the two can never drift apart.
   *
   * Pass a fuller sentence where the ring stands alone with no text beside it —
   * the fourteen-day adherence grid is the case that needs it, where every cell
   * is otherwise an unlabelled dot.
   */
  label?: string;
  /**
   * Set where a text label already sits next to the ring and would be read
   * twice. The shape still carries the state visually; it just stops being its
   * own stop in the screen reader's path.
   */
  decorative?: boolean;
};

const BOX = 24;
const STROKE = 2;
const R = BOX / 2 - STROKE / 2;
const C = BOX / 2;

export const DoseRing = ({ state, size = 20, label, decorative = false }: Props) => {
  const { color } = useTheme();

  const hollow = (stroke: string, dashed = false) => (
    <Circle
      cx={C}
      cy={C}
      r={R}
      stroke={stroke}
      strokeWidth={STROKE}
      fill="none"
      strokeDasharray={dashed ? '3 2.5' : undefined}
    />
  );

  const disc = (opacity = 1) => (
    <Circle cx={C} cy={C} r={BOX / 2} fill={color.accent} opacity={opacity} />
  );

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${BOX} ${BOX}`}
      accessible={!decorative}
      accessibilityRole={decorative ? 'none' : 'image'}
      accessibilityLabel={decorative ? undefined : (label ?? doseStateLabel(state))}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'yes'}
    >
      {state === 'pending' && hollow(color.borderStrong)}

      {state === 'confirmed' && (
        <>
          {disc()}
          <Path
            d="M7 12.5 L10.5 16 L17 8.5"
            stroke={color.onAccent}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      )}

      {/* Taken, but not self-confirmed — a caregiver closed it out. */}
      {state === 'resolved_taken' && disc(0.45)}

      {state === 'unconfirmed' && (
        <>
          {hollow(color.amber)}
          <Circle cx={C} cy={C} r={3} fill={color.amber} />
        </>
      )}

      {state === 'resolved_missed' && (
        <>
          {hollow(color.red)}
          <Path
            d="M6.5 17.5 L17.5 6.5"
            stroke={color.red}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
        </>
      )}

      {state === 'resolved_unreachable' && hollow(color.textMuted, true)}
    </Svg>
  );
};
