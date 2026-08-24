import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { BackLink, Button, Card, Chip, Field, Screen, Text } from '../../components/ui';
import { refillRunway, runwayIsLow, runwayLabel } from '../../lib/doses';
import { supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import type { Medication } from '../../lib/types';
import { friendlyError } from '../../lib/errors';

const PRESETS = [
  { label: 'Morning · 8:00', value: '08:00:00' },
  { label: 'Afternoon · 2:00', value: '14:00:00' },
  { label: 'Night · 9:00', value: '21:00:00' },
] as const;

/** Postgres returns time[] as 'HH:MM:SS'; the chips speak the same language. */
const normalise = (value: string): string =>
  value.length === 5 ? `${value}:00` : value;

const isValidTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/**
 * Everything you can do to one medication, in one place: change the schedule,
 * record a refill, write its tag, or stop tracking it.
 */
export default function MedicationDetail() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();

  const [medication, setMedication] = useState<Medication | null>(null);
  const [name, setName] = useState('');
  const [doseText, setDoseText] = useState('');
  const [times, setTimes] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [refill, setRefill] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('medications')
      .select('*')
      .eq('id', id)
      .maybeSingle<Medication>();

    if (!data) return;

    setMedication(data);
    setName(data.name);
    setDoseText(data.dose_text ?? '');
    setTimes(data.times.map(normalise));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleTime = (value: string) => {
    setSaved(false);
    setTimes((current) =>
      current.includes(value)
        ? current.filter((t) => t !== value)
        : [...current, value].sort(),
    );
  };

  const save = async () => {
    setBusy(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('medications')
      .update({
        name: name.trim(),
        dose_text: doseText.trim() === '' ? null : doseText.trim(),
        times,
      })
      .eq('id', id);

    setBusy(false);

    if (updateError) {
      setError(friendlyError(updateError));
      return;
    }

    setSaved(true);
    await load();
  };

  const addRefill = async () => {
    setBusy(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('record_refill', {
      p_medication_id: id,
      p_units: Number(refill),
    });

    setBusy(false);

    if (rpcError) {
      setError(friendlyError(rpcError));
      return;
    }

    setRefill('');
    await load();
  };

  const stopTracking = () => {
    Alert.alert(
      `Stop tracking ${medication?.name ?? 'this medication'}?`,
      'Past doses stay in the history. You can add it again later.',
      [
        { text: 'Keep tracking', style: 'cancel' },
        {
          text: 'Stop tracking',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('medications').update({ active: false }).eq('id', id);
            router.back();
          },
        },
      ],
    );
  };

  if (!medication) {
    return (
      <Screen>
        <BackLink />
      </Screen>
    );
  }

  const runway = refillRunway(medication);
  const low = runwayIsLow(runway);
  const extraTimes = times.filter((t) => !PRESETS.some((p) => p.value === t));

  return (
    <Screen footerSpace>
      <View style={{ gap: space[6] }}>
        <BackLink />
        <Text variant="title">{medication.name}</Text>

        {/* Stock first — it is the thing most likely to be out of date. */}
        <Card tone={low ? 'amber' : 'surface'}>
          <View style={{ gap: space[4] }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text variant="eyebrow" color="textMuted">
                In hand
              </Text>
              <Text variant="bodyStrong" color={low ? 'amber' : 'textSecondary'}>
                {runwayLabel(runway)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Add tablets"
                  value={refill}
                  onChangeText={(v) => setRefill(v.replace(/[^0-9]/g, ''))}
                  placeholder="30"
                  keyboardType="number-pad"
                />
              </View>
              <Button
                label="Record refill"
                onPress={addRefill}
                disabled={refill === '' || Number(refill) <= 0}
                loading={busy}
              />
            </View>
          </View>
        </Card>

        <Field label="Medication" value={name} onChangeText={(v) => { setName(v); setSaved(false); }} />
        <Field
          label="Dose"
          value={doseText}
          onChangeText={(v) => { setDoseText(v); setSaved(false); }}
          placeholder="5mg · 1 tablet"
        />

        <View style={{ gap: space[3] }}>
          <Text variant="eyebrow" color="textMuted">
            When
          </Text>
          <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
            {PRESETS.map((preset) => (
              <Chip
                key={preset.value}
                label={preset.label}
                selected={times.includes(preset.value)}
                onPress={() => toggleTime(preset.value)}
              />
            ))}
            {extraTimes.map((time) => (
              <Chip key={time} label={time.slice(0, 5)} selected onPress={() => toggleTime(time)} />
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Another time"
                value={custom}
                onChangeText={setCustom}
                placeholder="18:30"
                hint="24-hour, like 18:30"
                invalid={custom.length > 0 && !isValidTime(custom)}
              />
            </View>
            <Button
              label="Add"
              variant="secondary"
              disabled={!isValidTime(custom)}
              onPress={() => {
                toggleTime(normalise(custom));
                setCustom('');
              }}
            />
          </View>
        </View>

        {error ? (
          <Text variant="caption" color="red">
            {error}
          </Text>
        ) : null}

        <Button
          label={saved ? 'Saved' : 'Save changes'}
          onPress={save}
          loading={busy}
          disabled={name.trim() === '' || times.length === 0}
          full
        />

        <Button
          label="Set up pill box tag"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: '/(caregiver)/tag-setup',
              params: { memberId, medicationId: id, medication: medication.name },
            })
          }
          full
        />

        <Button label="Stop tracking" variant="quiet" onPress={stopTracking} full />
      </View>
    </Screen>
  );
}
