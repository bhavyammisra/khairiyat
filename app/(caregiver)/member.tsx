import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { BackLink, Button, Card, DoseRing, Field, Screen, Text } from '../../components/ui';
import {
  adherenceRate,
  doseStateLabel,
  driftInsight,
  driftSentence,
  formatTime,
  refillRunway,
  runwayIsLow,
  runwayLabel,
} from '../../lib/doses';
import { loadMemberHistory } from '../../lib/family';
import { supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import type { DoseWindow, Medication } from '../../lib/types';

const dayKey = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const lastDays = (count: number): string[] => {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(dayKey(d.toISOString()));
  }
  return out;
};

export default function MemberDetail() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();

  const [medications, setMedications] = useState<Medication[]>([]);
  const [windows, setWindows] = useState<DoseWindow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneSaved, setPhoneSaved] = useState(false);
  // Hers, not this phone's. A daughter in Toronto reading her mother's chart in
  // Ludhiana must see the doses bucketed by Ludhiana's clock.
  const [timezone, setTimezone] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const history = await loadMemberHistory(id);
    setMedications(history.medications);
    setWindows(history.windows);

    const { data } = await supabase
      .from('members')
      .select('phone, timezone')
      .eq('id', id)
      .maybeSingle<{ phone: string | null; timezone: string | null }>();
    setPhone(data?.phone ?? '');
    setTimezone(data?.timezone ?? undefined);

    setRefreshing(false);
  }, [id]);

  const savePhone = async () => {
    await supabase
      .from('members')
      .update({ phone: phone.trim() === '' ? null : phone.trim() })
      .eq('id', id);
    setPhoneSaved(true);
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const today = dayKey(new Date().toISOString());
  const todayWindows = windows.filter((w) => dayKey(w.scheduled_at) === today);

  const adherence = adherenceRate(windows);
  const drift = driftInsight(windows, medications, Date.now(), timezone);
  const days = lastDays(14);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: space[7] }}>
        <BackLink />
        <Text variant="title">{name ?? 'Member'}</Text>

        {/* Today */}
        <View style={{ gap: space[3] }}>
          <Text variant="eyebrow" color="textMuted">
            Today
          </Text>
          {todayWindows.length === 0 ? (
            <Text color="textSecondary">Nothing scheduled today.</Text>
          ) : (
            <View style={{ gap: space[3] }}>
              <View style={{ flexDirection: 'row', gap: space[3], flexWrap: 'wrap' }}>
                {todayWindows.map((w) => (
                  // The caption below reads every one of these out in full.
                  <DoseRing key={w.id} state={w.state} size={36} decorative />
                ))}
              </View>
              <Text variant="caption" color="textSecondary">
                {todayWindows
                  .map(
                    (w) =>
                      `${formatTime(w.scheduled_at)} ${doseStateLabel(w.state)}` +
                      // A tap that landed outside every window. Worth showing:
                      // it is either a double dose or a schedule that no longer
                      // matches what she actually does.
                      (w.is_extra ? ' (outside the usual time)' : ''),
                  )
                  .join(' · ')}
              </Text>
            </View>
          )}
        </View>

        {/* The sentence read aloud on stage. */}
        {drift ? (
          <Card tone="accent">
            <Text variant="bodyStrong">{driftSentence(drift)}</Text>
          </Card>
        ) : null}

        {/* Medications and refill runway */}
        <View style={{ gap: space[3] }}>
          <Text variant="eyebrow" color="textMuted">
            Medications
          </Text>

          {medications.length === 0 ? (
            <Text color="textSecondary">
              No medications yet. Add the first one to start tracking.
            </Text>
          ) : (
            medications.map((medication) => {
              const runway = refillRunway(medication);
              const low = runwayIsLow(runway);

              return (
                // Tapping the row opens tag setup, so the card does not need
                // to carry a full-width button. Same information, half the
                // height — a long medication list should not feel like work.
                <Card
                  key={medication.id}
                  tone={low ? 'amber' : 'surface'}
                  onPress={() =>
                    router.push({
                      pathname: '/(caregiver)/medication',
                      params: { id: medication.id, memberId: id },
                    })
                  }
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: space[3],
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {medication.name}
                      </Text>
                      <Text variant="caption" color="textSecondary" numberOfLines={1}>
                        {[medication.dose_text, medication.times.length === 1
                          ? 'once a day'
                          : `${medication.times.length} times a day`]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>

                    <Text variant="caption" color={low ? 'amber' : 'textMuted'}>
                      {runwayLabel(runway)}
                    </Text>
                  </View>
                </Card>
              );
            })
          )}
        </View>

        {/* 14-day grid: rows are medications, columns are days. */}
        {medications.length > 0 ? (
          <View style={{ gap: space[3] }}>
            <Text variant="eyebrow" color="textMuted">
              Last 14 days
            </Text>

            {adherence !== null ? (
              <Text color="textSecondary">
                {Math.round(adherence * 100)}% of doses confirmed or accounted for.
              </Text>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ gap: space[2] }}>
                {medications.map((medication) => (
                  <View
                    key={medication.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}
                  >
                    <View style={{ width: 96 }}>
                      <Text variant="caption" numberOfLines={1}>
                        {medication.name}
                      </Text>
                    </View>
                    {days.map((day) => {
                      const cells = windows.filter(
                        (w) => w.medication_id === medication.id && dayKey(w.scheduled_at) === day,
                      );

                      return (
                        <View key={day} style={{ flexDirection: 'row', gap: space[1] }}>
                          {cells.length === 0 ? (
                            <View style={{ width: 12, height: 12 }} />
                          ) : (
                            cells.map((cell) => (
                              // 12dp of shape and nothing else. Without this the
                              // whole three-week grid is silent.
                              <DoseRing
                                key={cell.id}
                                state={cell.state}
                                size={12}
                                label={`${medication.name}, ${day}, ${doseStateLabel(cell.state)}`}
                              />
                            ))
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* If you have to ask what a shape means, so will a judge. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
              {(
                [
                  ['confirmed', 'Taken'],
                  ['pending', 'Due'],
                  ['unconfirmed', 'No confirmation'],
                  ['resolved_taken', 'Taken, confirmed by family'],
                  ['resolved_missed', 'Missed'],
                  ['resolved_unreachable', 'Not reached'],
                ] as const
              ).map(([state, label]) => (
                <View
                  key={state}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}
                >
                  <DoseRing state={state} size={12} decorative />
                  <Text variant="caption" color="textMuted">
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Without a number the "Call" button never appears on an
            unconfirmed dose, which is the whole point of that card. */}
        <View style={{ gap: space[3] }}>
          <Text variant="eyebrow" color="textMuted">
            Phone
          </Text>
          <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  setPhoneSaved(false);
                }}
                placeholder="+91 98123 45678"
                keyboardType="phone-pad"
                hint="Used by the Call button when a dose needs checking."
              />
            </View>
            <Button
              label={phoneSaved ? 'Saved' : 'Save'}
              variant="secondary"
              onPress={savePhone}
            />
          </View>
        </View>

        <Button
          label="Emergency information"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/(caregiver)/emergency',
              params: { id, name: name ?? '' },
            })
          }
          full
        />
      </View>
    </Screen>
  );
}
