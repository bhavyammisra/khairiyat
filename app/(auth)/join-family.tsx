import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Button, Card, Screen, Text } from '../../components/ui';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { layout, radius, space, touch, typeScale, useTheme } from '../../lib/theme';
import type { MemberRole } from '../../lib/types';
import { friendlyError } from '../../lib/errors';

const CODE_LENGTH = 6;

type Unclaimed = {
  id: string;
  name: string;
  role: MemberRole;
  family_name: string;
};

/**
 * Joining is the one flow RLS deliberately blocks — you are not a member yet,
 * so you cannot read the member list. Both steps go through security definer
 * RPCs rather than loosened policies.
 */
export default function JoinFamily() {
  const { color } = useTheme();
  const { refresh } = useSession();

  const [code, setCode] = useState('');
  const [people, setPeople] = useState<Unclaimed[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lookUp = async () => {
    setBusy(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc('unclaimed_members', {
      p_join_code: code,
    });

    setBusy(false);

    if (rpcError) {
      setError(friendlyError(rpcError));
      return;
    }

    const rows = (data ?? []) as Unclaimed[];

    if (rows.length === 0) {
      setError(
        'No one is waiting to be claimed under that code. Check the six characters and try again.',
      );
      return;
    }

    setPeople(rows);
  };

  const claim = async (memberId: string) => {
    setBusy(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('claim_member_profile', {
      p_join_code: code,
      p_member_id: memberId,
    });

    if (rpcError) {
      setBusy(false);
      setError(friendlyError(rpcError));
      return;
    }

    await refresh();
    setBusy(false);
    router.replace('/');
  };

  const boxes = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? '');

  return (
    <Screen>
      <View style={{ gap: space[6] }}>
        <View style={{ gap: space[2] }}>
          <Text variant="title">Join a family</Text>
          <Text color="textSecondary">
            Enter the six-character code from someone already in the family.
          </Text>
        </View>

        {/* One hidden input behind six boxes — six real inputs fight the
            keyboard and lose. */}
        <View>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {boxes.map((character, index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  aspectRatio: 0.85,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: color.surfaceRaised,
                  borderColor: index === code.length ? color.accent : color.border,
                  borderWidth: layout.hairline,
                  borderRadius: radius.sm,
                }}
              >
                <Text variant="name">{character}</Text>
              </View>
            ))}
          </View>

          <TextInput
            value={code}
            onChangeText={(next) => {
              setCode(next.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH));
              setPeople(null);
              setError(null);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={CODE_LENGTH}
            style={[
              typeScale.body,
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: 0,
              },
            ]}
          />
        </View>

        {error ? (
          <Text variant="caption" color="red">
            {error}
          </Text>
        ) : null}

        {people === null ? (
          <Button
            label="Find my family"
            onPress={lookUp}
            disabled={code.length < CODE_LENGTH}
            loading={busy}
            full
          />
        ) : (
          <View style={{ gap: space[3] }}>
            <Text variant="eyebrow" color="textMuted">
              {people[0]?.family_name ?? 'Your family'}
            </Text>
            <Text color="textSecondary">Which one are you?</Text>

            {people.map((person) => (
              <Pressable
                key={person.id}
                onPress={() => void claim(person.id)}
                disabled={busy}
                style={{ minHeight: touch.min }}
              >
                <Card>
                  <Text variant="name">{person.name}</Text>
                  <Text variant="caption" color="textSecondary">
                    {person.role === 'caregiver' ? 'Caregiver' : 'Care recipient'}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
