import { router } from 'expo-router';
import { View } from 'react-native';

import { BackLink, Button, Card, Screen, Segmented, Text } from '../../components/ui';
import { useSession } from '../../lib/session';
import { space, useTheme, type ThemePreference } from '../../lib/theme';

/** Three rows. A short settings screen reads as confidence, not missing work. */
export default function Settings() {
  const { preference, setPreference } = useTheme();
  const { family, signOut } = useSession();

  return (
    <Screen>
      <View style={{ gap: space[6] }}>
        <BackLink />
        <Text variant="title">Settings</Text>

        <View style={{ gap: space[3] }}>
          <Text variant="eyebrow" color="textMuted">
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

        <View style={{ gap: space[3] }}>
          <Text variant="eyebrow" color="textMuted">
            Family code
          </Text>
          <Card>
            <Text variant="name">{family?.join_code ?? '······'}</Text>
            <Text variant="caption" color="textSecondary">
              Share this so someone can join {family?.name ?? 'the family'} and claim
              their name.
            </Text>
          </Card>
        </View>

        <Button
          label="Sign out"
          variant="secondary"
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
