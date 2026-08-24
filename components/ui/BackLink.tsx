import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { space, touch } from '../../lib/theme';
import { Text } from './Text';

/**
 * Caregiver screens have no header, so this is the only visible way back.
 * Simple Mode never uses it — the parent's app has no navigation at all.
 */
export const BackLink = ({ label = 'Back' }: { label?: string }) => (
  <Pressable
    accessibilityRole="button"
    onPress={() => router.back()}
    hitSlop={space[3]}
    style={{ minHeight: touch.min, justifyContent: 'center' }}
  >
    <Text variant="label" color="accent">
      ‹ {label}
    </Text>
  </Pressable>
);
