import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle } from 'react-native-svg';

import { BackLink, Button, Card, Screen, Text } from '../../components/ui';
import { cancelWrite, generateToken, isNfcAvailable, tokenUri, writeToken } from '../../lib/nfc';
import { supabase } from '../../lib/supabase';
import { radius, space, useTheme } from '../../lib/theme';

type Status = 'idle' | 'waiting' | 'done' | 'failed';

/**
 * A tag is bound to one member and one medication. The QR below encodes the
 * same token — one resolver reads both.
 */
export default function TagSetup() {
  const { color } = useTheme();
  const { memberId, medicationId, medication } = useLocalSearchParams<{
    memberId: string;
    medicationId: string;
    medication?: string;
  }>();

  const [token, setToken] = useState<string | null>(null);
  const [hasNfc, setHasNfc] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState<string | null>(null);

  // Create the tag row first, so the QR is usable even if NFC never works.
  useEffect(() => {
    let active = true;

    const setup = async () => {
      setHasNfc(await isNfcAvailable());

      const { data } = await supabase
        .from('tags')
        .select('token')
        .eq('member_id', memberId)
        .eq('medication_id', medicationId)
        .limit(1)
        .maybeSingle<{ token: string }>();

      if (!active) return;

      if (data) {
        setToken(data.token);
        return;
      }

      const fresh = generateToken();
      const { error } = await supabase.from('tags').insert({
        token: fresh,
        member_id: memberId,
        medication_id: medicationId,
        label: medication ?? null,
      });

      if (active && !error) setToken(fresh);
    };

    void setup();

    return () => {
      active = false;
      void cancelWrite();
    };
  }, [memberId, medicationId, medication]);

  const write = async () => {
    if (!token) return;

    setStatus('waiting');
    setMessage(null);

    const result = await writeToken(token);

    if (result.ok) {
      setStatus('done');
      return;
    }

    setStatus('failed');
    setMessage(result.reason);
  };

  return (
    <Screen>
      <View style={{ gap: space[6] }}>
        <BackLink />
        <View style={{ gap: space[2] }}>
          <Text variant="title">Set up the pill box tag</Text>
          <Text color="textSecondary">
            {medication
              ? `This sticker will log ${medication} when it is tapped.`
              : 'This sticker will log a dose when it is tapped.'}
          </Text>
        </View>

        {/* Concentric target. Fills solid on success. */}
        <View style={{ alignItems: 'center', paddingVertical: space[5] }}>
          <Svg width={180} height={180} viewBox="0 0 100 100">
            <Circle
              cx={50}
              cy={50}
              r={48}
              fill="none"
              strokeWidth={1.5}
              stroke={status === 'done' ? color.accent : color.borderStrong}
            />
            <Circle
              cx={50}
              cy={50}
              r={34}
              fill="none"
              strokeWidth={1.5}
              stroke={status === 'done' ? color.accent : color.borderStrong}
            />
            <Circle
              cx={50}
              cy={50}
              r={20}
              fill={status === 'done' ? color.accent : 'none'}
              strokeWidth={1.5}
              stroke={status === 'done' ? color.accent : color.borderStrong}
            />
          </Svg>
        </View>

        <Text style={{ textAlign: 'center' }} color="textSecondary">
          {status === 'waiting'
            ? 'Hold the sticker against the back of the phone.'
            : status === 'done'
              ? 'Sticker ready. Put it on the pill box.'
              : hasNfc === false
                ? 'This phone cannot write stickers. Use the QR code below.'
                : 'Tap Write, then hold the sticker to the phone.'}
        </Text>

        {message ? (
          <Text variant="caption" color="red" style={{ textAlign: 'center' }}>
            {message}
          </Text>
        ) : null}

        {hasNfc ? (
          <Button
            label={status === 'done' ? 'Write another' : 'Write sticker'}
            onPress={write}
            loading={status === 'waiting'}
            disabled={!token}
            full
          />
        ) : null}

        {token ? (
          <Card>
            <View style={{ gap: space[4], alignItems: 'center' }}>
              <Text variant="eyebrow" color="textMuted">
                Or scan this instead
              </Text>

              <View style={{ backgroundColor: color.surface, padding: space[4], borderRadius: radius.sm }}>
                <QRCode
                  value={tokenUri(token)}
                  size={160}
                  color={color.textPrimary}
                  backgroundColor={color.surface}
                />
              </View>

              <Text variant="caption" color="textMuted">
                {token}
              </Text>
              <Text variant="caption" color="textSecondary" style={{ textAlign: 'center' }}>
                Print or screenshot this and stick it on the box. Read it with the
                scanner in Khairiyat — a normal camera app will not open it.
              </Text>
            </View>
          </Card>
        ) : null}

        <Button label="Done" variant="quiet" onPress={() => router.back()} full />
      </View>
    </Screen>
  );
}
