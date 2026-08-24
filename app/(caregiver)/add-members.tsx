import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Field, Screen, Segmented, Text } from '../../components/ui';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import type { Member, MemberRole } from '../../lib/types';
import { friendlyError } from '../../lib/errors';

/**
 * One screen, no wizard, no modals, no per-member form. Name, role, add —
 * three people without ever leaving the screen. The friction here is what
 * decides whether onboarding lands under 90 seconds.
 */
export default function AddMembers() {
  const { family } = useSession();

  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<MemberRole>('care_recipient');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!family) return;
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('family_id', family.id)
      .order('created_at');
    setMembers((data ?? []) as Member[]);
  }, [family]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!family) return;

    setBusy(true);
    setError(null);

    const { error: insertError } = await supabase.from('members').insert({
      family_id: family.id,
      name: name.trim(),
      role,
      phone: phone.trim() === '' ? null : phone.trim(),
    });

    setBusy(false);

    if (insertError) {
      setError(friendlyError(insertError));
      return;
    }

    setName('');
    setPhone('');
    await load();
  };

  return (
    <Screen footerSpace>
      <View style={{ gap: space[6] }}>
        <View style={{ gap: space[2] }}>
          <Text variant="title">Who is in the family?</Text>
          <Text color="textSecondary">
            Add everyone you look after, and anyone else who should be able to see
            how they are doing. They can claim their own name later with the family
            code.
          </Text>
        </View>

        {members.length > 0 ? (
          <View style={{ gap: space[3] }}>
            {members.map((member) => (
              <Card key={member.id}>
                <Text variant="name">{member.name}</Text>
                <Text variant="caption" color="textSecondary">
                  {member.role === 'caregiver' ? 'Caregiver' : 'Care recipient'}
                  {member.phone ? ` · ${member.phone}` : ''}
                  {member.user_id === null ? ' · not claimed yet' : ''}
                </Text>
              </Card>
            ))}
          </View>
        ) : null}

        {/* Always-visible inline add row. */}
        <Card>
          <View style={{ gap: space[4] }}>
            <Field
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Sunita"
              returnKeyType="next"
            />

            <Field
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98123 45678"
              keyboardType="phone-pad"
              hint="So the family can call with one tap. You can leave this out."
              onSubmitEditing={() => {
                if (name.trim().length > 0) void add();
              }}
              returnKeyType="done"
            />

            <Segmented
              value={role}
              onChange={setRole}
              options={[
                { value: 'care_recipient', label: 'Care recipient' },
                { value: 'caregiver', label: 'Caregiver' },
              ]}
            />

            <Button
              label="Add to family"
              variant="secondary"
              onPress={add}
              disabled={name.trim().length === 0}
              loading={busy}
              full
            />
          </View>
        </Card>

        {error ? (
          <Text variant="caption" color="red">
            {error}
          </Text>
        ) : null}

        <Button
          label="Continue"
          onPress={() => router.replace('/(caregiver)/add-medication')}
          disabled={members.length === 0}
          full
        />
      </View>
    </Screen>
  );
}
