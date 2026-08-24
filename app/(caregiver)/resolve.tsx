import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Screen, Text } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import type { ResolutionState } from '../../lib/types';
import { friendlyError } from '../../lib/errors';

/**
 * Actions are phrased as what the caregiver did, after actually phoning her.
 * The app never decides whether a dose was missed — a human does.
 */
export default function Resolve() {
  const { id, name, medication, time } = useLocalSearchParams<{
    id: string;
    name?: string;
    medication?: string;
    time?: string;
  }>();

  const [busy, setBusy] = useState<ResolutionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const who = name && name.length > 0 ? name : 'them';

  const resolve = async (state: ResolutionState) => {
    setBusy(state);
    setError(null);

    const { error: rpcError } = await supabase.rpc('resolve_dose', {
      p_dose_window_id: id,
      p_state: state,
    });

    setBusy(null);

    if (rpcError) {
      setError(friendlyError(rpcError));
      return;
    }

    router.back();
  };

  return (
    <Screen>
      <View style={{ gap: space[6] }}>
        <View style={{ gap: space[2] }}>
          <Text variant="title">What happened?</Text>
          <Text color="textSecondary">
            {medication ?? 'The dose'}
            {time ? `, due at ${time}` : ''}. Give {who} a call, then tell Khairiyat
            how it went.
          </Text>
        </View>

        <View style={{ gap: space[3] }}>
          <Button
            label={`${who} took it`}
            onPress={() => void resolve('resolved_taken')}
            loading={busy === 'resolved_taken'}
            full
          />
          <Button
            label={`${who} missed it`}
            variant="secondary"
            onPress={() => void resolve('resolved_missed')}
            loading={busy === 'resolved_missed'}
            full
          />
          <Button
            label={`Couldn't reach ${who}`}
            variant="secondary"
            onPress={() => void resolve('resolved_unreachable')}
            loading={busy === 'resolved_unreachable'}
            full
          />
        </View>

        {error ? (
          <Text variant="caption" color="red">
            {error}
          </Text>
        ) : null}

        <Button label="Not now" variant="quiet" onPress={() => router.back()} full />
      </View>
    </Screen>
  );
}
