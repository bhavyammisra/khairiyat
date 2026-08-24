import { router } from 'expo-router';
import { View } from 'react-native';

import { BackLink, Button, Screen, Segmented, Text } from '../../components/ui';
import { useSession } from '../../lib/session';
import { space, useTheme, type ThemePreference } from '../../lib/theme';

/**
 * Deliberately separate from the caregiver settings screen: a care recipient
 * must never end up inside the caregiver stack, and there is no family data
 * here — no member list, no join code.
 *
 * This exists because signing out has to be reachable. Only one phone is
 * guaranteed for the demo, so every two-phone flow must also work by switching
 * accounts on one device.
 */
export default function SimpleSettings() {
  const { preference, setPreference } = useTheme();
  const { member, signOut } = useSession();

  return (
    <Screen>
      <View style={{ gap: space[6] }}>
        <BackLink label="Back to my doses" />

        <Text variant="simpleTitle">Settings</Text>

        <View style={{ gap: space[3] }}>
          <Text variant="simpleBody" color="textSecondary">
            Appearance
          </Text>
          <Segmented<ThemePreference>
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </View>

        {member ? (
          <Text variant="simpleBody" color="textSecondary">
            Signed in as {member.name}.
          </Text>
        ) : null}

        <Button
          label="Sign out"
          variant="secondary"
          simple
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
          full
        />
      </View>
    </Screen>
  );
}
