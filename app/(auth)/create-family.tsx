import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Screen, Text } from '../../components/ui';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import { friendlyError } from '../../lib/errors';

/**
 * Creating a family goes through an RPC rather than a plain insert: you cannot
 * be a member of a family that does not exist yet, so RLS would block the
 * member row. See supabase/migrations/002_rls.sql.
 */
export default function CreateFamily() {
  const { refresh } = useSession();
  const [familyName, setFamilyName] = useState('');
  const [myName, setMyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc('create_family', {
      p_family_name: familyName.trim(),
      p_my_name: myName.trim(),
    });

    if (rpcError) {
      setBusy(false);
      setError(friendlyError(rpcError));
      return;
    }

    await refresh();
    setBusy(false);
    router.replace('/(caregiver)/add-members');
  };

  const ready = familyName.trim().length > 0 && myName.trim().length > 0;

  return (
    <Screen>
      <View style={{ gap: space[6] }}>
        <View style={{ gap: space[2] }}>
          <Text variant="title">Name your family</Text>
          <Text color="textSecondary">
            Everyone you add will see this name at the top of their screen.
          </Text>
        </View>

        <Field
          label="Family name"
          value={familyName}
          onChangeText={setFamilyName}
          placeholder="Rana Family"
          autoFocus
        />

        <Field
          label="Your name"
          value={myName}
          onChangeText={setMyName}
          placeholder="Arjun"
          hint="How the rest of the family will see you."
        />

        {error ? (
          <Text variant="caption" color="red">
            {error}
          </Text>
        ) : null}

        <Button
          label="Create family"
          onPress={submit}
          disabled={!ready}
          loading={busy}
          full
        />
      </View>
    </Screen>
  );
}
