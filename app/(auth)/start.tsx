import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Screen, Text } from '../../components/ui';
import { useSession } from '../../lib/session';
import { space } from '../../lib/theme';

/** Signed in, but not part of a family yet. */
export default function Start() {
  const { signOut } = useSession();

  return (
    <Screen center>
      <View style={{ gap: space[6], width: '100%' }}>
        <View style={{ gap: space[2] }}>
          <Text variant="title">One more step</Text>
          <Text color="textSecondary">
            Start a family to look after someone, or join one you have been given a
            code for.
          </Text>
        </View>

        <Card>
          <View style={{ gap: space[3] }}>
            <Text variant="name">Start a family</Text>
            <Text variant="caption" color="textSecondary">
              Add the people you look after and the medications they take.
            </Text>
            <Button
              label="Start a family"
              onPress={() => router.push('/(auth)/create-family')}
              full
            />
          </View>
        </Card>

        <Card>
          <View style={{ gap: space[3] }}>
            <Text variant="name">Join a family</Text>
            <Text variant="caption" color="textSecondary">
              Enter the six-character code from someone already in it.
            </Text>
            <Button
              label="Join a family"
              variant="secondary"
              onPress={() => router.push('/(auth)/join-family')}
              full
            />
          </View>
        </Card>

        <Button label="Sign out" variant="quiet" onPress={() => void signOut()} full />
      </View>
    </Screen>
  );
}
