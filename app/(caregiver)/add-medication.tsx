import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, Button, Chip, Field, Screen, Text } from '../../components/ui';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import type { Member } from '../../lib/types';
import { friendlyError } from '../../lib/errors';

/** Chips, not a time-picker dialog per row. */
const PRESETS = [
  { label: 'Morning · 8:00', value: '08:00' },
  { label: 'Afternoon · 2:00', value: '14:00' },
  { label: 'Night · 9:00', value: '21:00' },
] as const;

const isValidTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export default function AddMedication() {
  const { family } = useSession();

  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [doseText, setDoseText] = useState('');
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!family) return;

    void supabase
      .from('members')
      .select('*')
      .eq('family_id', family.id)
      .order('created_at')
      .then(({ data }) => {
        const rows = (data ?? []) as Member[];
        setMembers(rows);
        setMemberId(
          (rows.find((m) => m.role === 'care_recipient') ?? rows[0])?.id ?? null,
        );
      });
  }, [family]);

  const toggleTime = (value: string) => {
    setTimes((current) =>
      current.includes(value)
        ? current.filter((t) => t !== value)
        : [...current, value].sort(),
    );
  };

  const addCustom = () => {
    if (!isValidTime(custom)) return;
    toggleTime(custom);
    setCustom('');
    setCustomOpen(false);
  };

  const save = async () => {
    if (!memberId) return;

    setBusy(true);
    setError(null);

    const { error: insertError } = await supabase.from('medications').insert({
      member_id: memberId,
      name: name.trim(),
      dose_text: doseText.trim() === '' ? null : doseText.trim(),
      times,
      quantity_remaining: quantity.trim() === '' ? null : Number(quantity),
      units_per_dose: 1,
    });

    setBusy(false);

    if (insertError) {
      setError(friendlyError(insertError));
      return;
    }

    router.replace('/(caregiver)/home');
  };

  const extraTimes = times.filter((t) => !PRESETS.some((p) => p.value === t));
  const ready = memberId !== null && name.trim().length > 0 && times.length > 0;

  return (
    <Screen footerSpace>
      <View style={{ gap: space[6] }}>
        <View style={{ gap: space[2] }}>
          <Text variant="title">Add a medication</Text>
          <Text color="textSecondary">
            You can add more later from the family screen.
          </Text>
        </View>

        <View style={{ gap: space[3] }}>
          <Text variant="eyebrow" color="textMuted">
            Who takes it
          </Text>
          <View style={{ flexDirection: 'row', gap: space[3], flexWrap: 'wrap' }}>
            {members.map((member) => (
              <Pressable
                key={member.id}
                onPress={() => setMemberId(member.id)}
                style={{ alignItems: 'center', gap: space[2] }}
              >
                <Avatar name={member.name} selected={member.id === memberId} />
                <Text
                  variant="caption"
                  color={member.id === memberId ? 'accent' : 'textSecondary'}
                >
                  {member.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Field
          label="Medication"
          value={name}
          onChangeText={setName}
          placeholder="Amlodipine"
        />

        <Field
          label="Dose"
          value={doseText}
          onChangeText={setDoseText}
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
              <Chip
                key={time}
                label={time}
                selected
                onPress={() => toggleTime(time)}
              />
            ))}
            <Chip
              label="+ Custom"
              selected={false}
              onPress={() => setCustomOpen(!customOpen)}
            />
          </View>

          {customOpen ? (
            <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Time"
                  value={custom}
                  onChangeText={setCustom}
                  placeholder="18:30"
                  keyboardType="numbers-and-punctuation"
                  hint="24-hour, like 18:30"
                  invalid={custom.length > 0 && !isValidTime(custom)}
                />
              </View>
              <Button
                label="Add"
                variant="secondary"
                onPress={addCustom}
                disabled={!isValidTime(custom)}
              />
            </View>
          ) : null}
        </View>

        <Field
          label="Tablets in hand"
          value={quantity}
          onChangeText={(value) => setQuantity(value.replace(/[^0-9]/g, ''))}
          placeholder="30"
          keyboardType="number-pad"
          hint="Lets Khairiyat tell you when a refill is coming up."
        />

        {error ? (
          <Text variant="caption" color="red">
            {error}
          </Text>
        ) : null}

        <Button
          label="Save medication"
          onPress={save}
          disabled={!ready}
          loading={busy}
          full
        />
      </View>
    </Screen>
  );
}
