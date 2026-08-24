import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../components/ui';
import { ensureNotificationChannel, listenForTakenAction } from '../lib/notifications';
import { SessionProvider } from '../lib/session';
import { useTheme } from '../lib/theme';

const Navigator = () => {
  const { scheme, color } = useTheme();

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg },
          animation: 'fade',
        }}
      />
    </>
  );
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    void ensureNotificationChannel();
    return listenForTakenAction(() => undefined);
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {/* Hold the screen rather than flashing fallback type — the serif is
            half the identity and a swap is visible on stage. */}
        {fontsLoaded ? (
          <SessionProvider>
            <Navigator />
          </SessionProvider>
        ) : (
          <Splash />
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const Splash = () => {
  const { color } = useTheme();
  return <View style={{ flex: 1, backgroundColor: color.bg }} />;
};
