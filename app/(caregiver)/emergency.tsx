import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { BackLink, Button, Card, Field, Screen, Text } from '../../components/ui';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import type { EmergencyInfo, Medication, Member } from '../../lib/types';
import { friendlyError } from '../../lib/errors';

const Row = ({ label, value }: { label: string; value: string }) => (
  <View style={{ gap: space[1] }}>
    <Text variant="eyebrow" color="textMuted">
      {label}
    </Text>
    <Text>{value}</Text>
  </View>
);

const toList = (raw: string): string[] | null => {
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : null;
};

/** One screen, one tap from member detail. The call is the feature. */
export default function Emergency() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { family } = useSession();

  const [info, setInfo] = useState<EmergencyInfo | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [caregivers, setCaregivers] = useState<Member[]>([]);

  const [editing, setEditing] = useState(false);
  const [bloodGroup, setBloodGroup] = useState('');
  const [allergies, setAllergies] = useState('');
  const [conditions, setConditions] = useState('');
  const [insurance, setInsurance] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [infoResult, medicationResult] = await Promise.all([
      supabase.from('emergency_info').select('*').eq('member_id', id).maybeSingle<EmergencyInfo>(),
      supabase.from('medications').select('*').eq('member_id', id).eq('active', true),
    ]);

    const row = infoResult.data ?? null;
    setInfo(row);
    setMedications((medicationResult.data ?? []) as Medication[]);

    setBloodGroup(row?.blood_group ?? '');
    setAllergies((row?.allergies ?? []).join(', '));
    setConditions((row?.conditions ?? []).join(', '));
    setInsurance(row?.insurance_note ?? '');

    if (family) {
      const { data } = await supabase
        .from('members')
        .select('*')
        .eq('family_id', family.id)
        .eq('role', 'caregiver');
      setCaregivers((data ?? []) as Member[]);
    }
  }, [id, family]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setError(null);

    const { error: upsertError } = await supabase.from('emergency_info').upsert(
      {
        member_id: id,
        blood_group: bloodGroup.trim() === '' ? null : bloodGroup.trim(),
        allergies: toList(allergies),
        conditions: toList(conditions),
        insurance_note: insurance.trim() === '' ? null : insurance.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'member_id' },
    );

    setBusy(false);

    if (upsertError) {
      setError(friendlyError(upsertError));
      return;
    }

    setEditing(false);
    await load();
  };

  const list = (values: string[] | null | undefined) =>
    values && values.length > 0 ? values.join(', ') : 'Not recorded';

  return (
    <Screen>
      <View style={{ gap: space[6] }}>
        <BackLink />
        <View style={{ gap: space[2] }}>
          <Text variant="title">{name ?? 'Emergency information'}</Text>
          <Text color="textSecondary">Show this to whoever needs it.</Text>
        </View>

        {editing ? (
          <Card>
            <View style={{ gap: space[4] }}>
              <Field
                label="Blood group"
                value={bloodGroup}
                onChangeText={setBloodGroup}
                placeholder="B+"
                autoCapitalize="characters"
              />
              <Field
                label="Allergies"
                value={allergies}
                onChangeText={setAllergies}
                placeholder="Penicillin, Sulfa drugs"
                hint="Separate each one with a comma."
              />
              <Field
                label="Conditions"
                value={conditions}
                onChangeText={setConditions}
                placeholder="Hypertension, Type 2 diabetes"
                hint="Separate each one with a comma."
              />
              <Field
                label="Insurance"
                value={insurance}
                onChangeText={setInsurance}
                placeholder="Star Health · policy SH-4471902"
              />

              {error ? (
                <Text variant="caption" color="red">
                  {error}
                </Text>
              ) : null}

              <Button label="Save" onPress={save} loading={busy} full />
              <Button
                label="Cancel"
                variant="quiet"
                onPress={() => {
                  setEditing(false);
                  void load();
                }}
                full
              />
            </View>
          </Card>
        ) : (
          <>
            <Card>
              <View style={{ gap: space[5] }}>
                <Row label="Blood group" value={info?.blood_group ?? 'Not recorded'} />
                <Row label="Allergies" value={list(info?.allergies)} />
                <Row label="Conditions" value={list(info?.conditions)} />
                <Row
                  label="Current medications"
                  value={
                    medications.length > 0
                      ? medications
                          .map((m) => (m.dose_text ? `${m.name} (${m.dose_text})` : m.name))
                          .join(', ')
                      : 'None recorded'
                  }
                />
                <Row label="Insurance" value={info?.insurance_note ?? 'Not recorded'} />
              </View>
            </Card>

            <Button
              label={info ? 'Edit this' : 'Add these details'}
              variant="secondary"
              onPress={() => setEditing(true)}
              full
            />
          </>
        )}

        <View style={{ gap: space[3] }}>
          <Text variant="eyebrow" color="textMuted">
            Family to call
          </Text>

          {caregivers.length === 0 ? (
            <Text color="textSecondary">No phone numbers saved yet.</Text>
          ) : (
            caregivers.map((person) => (
              <Card key={person.id}>
                <View style={{ gap: space[3] }}>
                  <Text variant="name">{person.name}</Text>
                  {person.phone ? (
                    <Button
                      label={`Call ${person.phone}`}
                      onPress={() => void Linking.openURL(`tel:${person.phone}`)}
                      full
                    />
                  ) : (
                    <Text variant="caption" color="textMuted">
                      No number saved.
                    </Text>
                  )}
                </View>
              </Card>
            ))
          )}
        </View>
      </View>
    </Screen>
  );
}
