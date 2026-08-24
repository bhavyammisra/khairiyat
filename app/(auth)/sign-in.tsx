import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Field, Screen, Text, Wordmark } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import { friendlyError } from '../../lib/errors';

/**
 * Sign in and sign up are one screen with a toggle at the bottom. Email and
 * password, nothing else — no phone OTP, no verification email. The whole
 * onboarding path has to run in under 90 seconds.
 */
export default function SignIn() {
  // Signing in is the common case — most opens are a returning member, and a
  // new family is created once. Sign up is one tap away.
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);

    const credentials = { email: email.trim(), password };
    const { error: authError } =
      mode === 'signUp'
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);

    setBusy(false);

    if (authError) {
      setError(friendlyError(authError));
      return;
    }

    router.replace('/');
  };

  const ready = email.trim().length > 3 && password.length >= 6;

  return (
    <Screen center>
      <View style={{ gap: space[6], width: '100%' }}>
        <View style={{ gap: space[4] }}>
          <Wordmark width={190} />
          <Text color="textSecondary">
            Know that they are well, without having to ask.
          </Text>
        </View>

        <View style={{ gap: space[4] }}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="At least 6 characters"
          />
        </View>

        {error ? (
          <Text variant="caption" color="red">
            {error}
          </Text>
        ) : null}

        <Button
          label={mode === 'signUp' ? 'Create account' : 'Sign in'}
          onPress={submit}
          disabled={!ready}
          loading={busy}
          full
        />

        <Pressable
          onPress={() => {
            setMode(mode === 'signUp' ? 'signIn' : 'signUp');
            setError(null);
          }}
          style={{ paddingVertical: space[3], alignItems: 'center' }}
        >
          <Text variant="label" color="accent">
            {mode === 'signUp' ? 'I already have an account' : 'Create an account'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
