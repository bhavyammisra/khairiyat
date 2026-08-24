import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { useSession } from '../lib/session';
import { useTheme } from '../lib/theme';

/**
 * Routes on session and role. A care recipient never sees anything but Simple
 * Mode; a caregiver lands on the family dashboard; a signed-in person with no
 * family yet still has to create or join one.
 */
export default function Index() {
  const { loading, session, member } = useSession();
  const { color } = useTheme();

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  }

  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (!member) return <Redirect href="/(auth)/start" />;
  if (member.role === 'care_recipient') return <Redirect href="/(simple)/home" />;

  return <Redirect href="/(caregiver)/home" />;
}
