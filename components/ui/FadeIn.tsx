import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

import { motion } from '../../lib/theme';

type Props = {
  children: ReactNode;
  /** Index in the list — staggers entry by 40ms per row. */
  index?: number;
};

/**
 * Cards fade and rise 12px on mount, staggered. Once — nothing loops, nothing
 * pulses, nothing shimmers. Skipped entirely when reduced motion is on.
 */
export const FadeIn = ({ children, index = 0 }: Props) => {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!active) return;
      setReduceMotion(enabled);

      if (enabled) {
        progress.setValue(1);
        return;
      }

      Animated.timing(progress, {
        toValue: 1,
        duration: motion.confirmSpringMs,
        delay: index * motion.rowStaggerMs,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      active = false;
    };
  }, [progress, index]);

  if (reduceMotion) return <>{children}</>;

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [motion.rowRisePx, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
};
