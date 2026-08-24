import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';

import { Button, Card, DoseRing, Screen, Text } from '../../components/ui';
import { doseStateLabel, formatTime, isTaken } from '../../lib/doses';
import { ensureToday, loadFamilyToday } from '../../lib/family';
import { listenForTags } from '../../lib/nfc';
import { enqueue, flush } from '../../lib/queue';
import { scheduleDoseReminders } from '../../lib/notifications';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import type { DoseWindow, Medication } from '../../lib/types';

const greeting = (hour: number): string => {
  if (hour < 12) return 'Good morning,';
  if (hour < 17) return 'Good afternoon,';
  return 'Good evening,';
};

/**
 * The parent's entire app. Today's own doses, nothing else. No tabs, no back
 * button, no navigation, no family data — nothing to get lost in.
 */
export default function SimpleMode() {
  const { family, member } = useSession();
  const [windows, setWindows] = useState<DoseWindow[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!family || !member) return;
    setRefreshing(true);
    // Replay anything captured while offline before reading state back.
    await flush();
    await ensureToday(family.id);
    const snapshot = await loadFamilyToday(family.id);
    const mine = snapshot.windows.filter((w) => w.member_id === member.id);
    setWindows(mine);
    setMedications(snapshot.medications);
    setRefreshing(false);
    setLoaded(true);

    // Local reminders for her own remaining doses. Never for the caregivers.
    void scheduleDoseReminders(mine, snapshot.medications);
  }, [family, member]);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // Belt and braces: if the installed build lacks the NDEF intent filter,
  // Android will not launch the app from a tap — but a tap while this screen
  // is open still lands here. Feature-detected; a no-op without NFC hardware.
  useEffect(
    () =>
      listenForTags((token) => {
        router.push({ pathname: '/t/[token]', params: { token, source: 'nfc' } });
      }),
    [],
  );

  const take = async (window: DoseWindow) => {
    setBusyId(window.id);

    const at = new Date().toISOString();
    const { error } = await supabase.rpc('confirm_dose', {
      p_dose_window_id: window.id,
      p_source: 'button',
      p_at: at,
    });

    // Offline is not a reason to lose a dose she actually took.
    if (error) {
      await enqueue({ kind: 'dose', doseWindowId: window.id, source: 'button', at });
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await refresh();
    setBusyId(null);
  };

  const medicationName = (id: string) =>
    medications.find((m) => m.id === id)?.name ?? 'Medication';

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: space[7] }}>
        <View style={{ gap: space[1] }}>
          <Text variant="simpleBody" color="textSecondary">
            {greeting(new Date().getHours())}
          </Text>
          <Text variant="simpleTitle">{member?.name ?? ''}</Text>
        </View>

        {!loaded ? null : windows.length === 0 ? (
          <Card>
            <Text variant="simpleBody" color="textSecondary">
              Nothing to take today.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: space[3] }}>
            {windows.map((window) => {
              const done = isTaken(window.state);

              return (
                <Card key={window.id}>
                  <View style={{ gap: space[4] }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space[4],
                      }}
                    >
                      <DoseRing state={window.state} size={64} decorative />
                      <View style={{ flex: 1, gap: space[1] }}>
                        <Text variant="simpleBody">
                          {medicationName(window.medication_id)}
                        </Text>
                        <Text variant="simpleBody" color="textSecondary">
                          {formatTime(window.scheduled_at)} · {doseStateLabel(window.state)}
                        </Text>
                      </View>
                    </View>

                    {!done ? (
                      <Button
                        label="I took this"
                        onPress={() => void take(window)}
                        loading={busyId === window.id}
                        simple
                        full
                      />
                    ) : null}
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        {/* Below every dose, deliberately. Simple Mode stays "nothing to get
            lost in" — but signing out has to be reachable, because account
            switching on one device is how the two-phone flows are demoed. */}
        <Button
          label="Settings"
          variant="quiet"
          simple
          onPress={() => router.push('/(simple)/settings')}
          full
        />
      </View>
    </Screen>
  );
}
