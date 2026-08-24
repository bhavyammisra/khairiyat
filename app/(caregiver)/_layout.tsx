import { Stack } from 'expo-router';

import { useTheme } from '../../lib/theme';

export default function CaregiverLayout() {
  const { color } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.bg },
      }}
    />
  );
}
