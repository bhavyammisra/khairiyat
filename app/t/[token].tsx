import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';

import { Button, DoseRing, Screen, Text } from '../../components/ui';
import { formatTime } from '../../lib/doses';
import { enqueue } from '../../lib/queue';
import { supabase } from '../../lib/supabase';
import { motion, space } from '../../lib/theme';
import type { LogSource, ResolveTagResult } from '../../lib/types';

/**
 * The hero path. Android launches this from the NFC tap even with the app
 * fully closed; the in-app QR scanner routes here too with source=qr.
 *
 * Full screen, no chrome. Failure gets the same full-screen treatment in
 * redSurface — never a toast, never an alert dialog.
 */
export default function TapConfirmation() {
  const { token, source } = useLocalSearchParams<{ token: string; source?: string }>();
  const [result, setResult] = useState<ResolveTagResult | null>(null);
  const [failed, setFailed] = useState(false);
  /** Network was down: the tap is on disk and will replay. */
  const [queued, setQueued] = useState(false);

  const fill = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;

    const run = async () => {
      const logSource: LogSource = source === 'qr' ? 'qr' : 'nfc';

      const at = new Date().toISOString();

      const { data, error } = await supabase.rpc('resolve_tag', {
        p_token: token,
        p_source: logSource,
        p_at: at,
      });

      if (!active) return;

      // A transport error means the network is down, not that the tag is bad —
      // an unknown tag comes back as data with outcome 'unknown_token'. She
      // took the pill either way, so never drop the tap.
      if (error) {
        await enqueue({ kind: 'tag', token, source: logSource, at });
        if (!active) return;
        setQueued(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      const row = (Array.isArray(data) ? data[0] : data) as ResolveTagResult | undefined;

      if (!row || row.outcome === 'unknown_token') {
        setFailed(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      setResult(row);

      // The emotional beat of the entire app.
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
      if (reduceMotion) {
        fill.setValue(1);
      } else {
        Animated.spring(fill, {
          toValue: 1,
          useNativeDriver: true,
          speed: 12,
          bounciness: 6,
        }).start();
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [token, source, fill]);

  // Auto-dismiss into Simple Mode, with a Done button for impatience.
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => router.replace('/(simple)/home'), motion.confirmationDismissMs);
    return () => clearTimeout(timer);
  }, [result]);

  if (queued) {
    return (
      <Screen background="accentSurface" center scroll={false}>
        <View style={{ gap: space[5], alignItems: 'center' }}>
          <DoseRing state="confirmed" size={120} decorative />
          <Text variant="title">Saved</Text>
          <Text color="textSecondary" style={{ textAlign: 'center' }}>
            The phone is offline, so the family will see this as soon as it is
            back on.
          </Text>
          <Button label="Done" onPress={() => router.replace('/(simple)/home')} />
        </View>
      </Screen>
    );
  }

  if (failed) {
    return (
      <Screen background="redSurface" center scroll={false}>
        <View style={{ gap: space[5], alignItems: 'center' }}>
          <Text variant="title">Couldn&apos;t read that sticker</Text>
          <Text color="textSecondary" style={{ textAlign: 'center' }}>
            Hold the phone against it for a second longer, or log the dose yourself.
          </Text>
          <Button label="Log it myself" onPress={() => router.replace('/(simple)/home')} />
        </View>
      </Screen>
    );
  }

  if (!result) {
    return (
      <Screen background="accentSurface" center scroll={false}>
        <DoseRing state="pending" size={140} decorative />
      </Screen>
    );
  }

  const alreadyDone = result.outcome === 'already_confirmed';
  const when = result.confirmed_at ?? result.scheduled_at;

  return (
    <Screen background="accentSurface" center scroll={false}>
      <View style={{ gap: space[6], alignItems: 'center' }}>
        <Animated.View
          style={{
            transform: [
              { scale: fill.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
            ],
            opacity: fill,
          }}
        >
          <DoseRing state="confirmed" size={140} decorative />
        </Animated.View>

        <View style={{ gap: space[2], alignItems: 'center' }}>
          <Text variant="name">{result.medication_name ?? 'Dose'}</Text>
          {when ? <Text variant="display">{formatTime(when)}</Text> : null}
          <Text color="textSecondary">
            {alreadyDone ? 'Already counted' : 'Taken'}
            {result.outcome === 'extra' ? ' · outside the usual time' : ''}
          </Text>
        </View>

        <Button label="Done" variant="quiet" onPress={() => router.replace('/(simple)/home')} />
      </View>
    </Screen>
  );
}
