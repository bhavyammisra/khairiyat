import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Field, Screen, Text } from '../../components/ui';
import { layout, radius, space, useTheme } from '../../lib/theme';

/**
 * The QR fallback. Same token as the NFC tag, same resolver — "the same token,
 * two ways to read it", which is a designed feature, not a save.
 *
 * A phone's stock camera app cannot open these codes, because the tag carries
 * a custom scheme and no https domain is configured. That is intentional: this
 * scanner is the only thing that reads them.
 */

/** Accepts the full URI, a bare token, or the last segment of either. */
export const extractToken = (raw: string): string | null => {
  const text = raw.trim();

  const uri = /khairiyat:\/\/t\/([A-Za-z0-9_-]+)/i.exec(text);
  if (uri?.[1]) return uri[1];

  if (/^[A-Za-z0-9_-]{8,}$/.test(text)) return text;

  const segment = text.split(/[/?#]/).filter(Boolean).pop();
  if (segment && /^[A-Za-z0-9_-]{8,}$/.test(segment)) return segment;

  return null;
};

export default function Scan() {
  const { color } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  const [seen, setSeen] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  const go = (token: string) => {
    if (handled.current) return;
    handled.current = true;
    router.push({ pathname: '/t/[token]', params: { token, source: 'qr' } });
  };

  const onScanned = (raw: string) => {
    if (handled.current) return;

    setSeen(raw);

    const token = extractToken(raw);
    if (token) go(token);
  };

  if (!permission) {
    return (
      <Screen center scroll={false}>
        <View />
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen center scroll={false}>
        <View style={{ gap: space[5], alignItems: 'center' }}>
          <Text variant="title">Let Khairiyat use the camera</Text>
          <Text color="textSecondary" style={{ textAlign: 'center' }}>
            It only reads the code on a pill box sticker. Nothing is recorded.
          </Text>
          <Button label="Allow camera" onPress={() => void requestPermission()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, gap: space[4] }}>
        <View style={{ gap: space[2] }}>
          <Text variant="title">Scan the sticker</Text>
          <Text color="textSecondary">
            Point the camera at the code on the pill box.
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            overflow: 'hidden',
            borderRadius: radius.lg,
            borderWidth: layout.hairline,
            borderColor: color.border,
          }}
        >
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => onScanned(data)}
          />
        </View>

        {/* Say what the camera actually read, so a code that will not resolve
            is obvious rather than silent. */}
        {seen && !extractToken(seen) ? (
          <Card tone="red">
            <View style={{ gap: space[2] }}>
              <Text variant="bodyStrong">That is not a Khairiyat sticker.</Text>
              <Text variant="caption" color="textSecondary">
                It reads: {seen}
              </Text>
            </View>
          </Card>
        ) : null}

        <Card>
          <View style={{ gap: space[3] }}>
            <Text variant="caption" color="textMuted">
              Or type the code printed under the sticker
            </Text>
            <Field
              value={manual}
              onChangeText={setManual}
              placeholder="a7K2M9PqRs4T"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              label="Log this dose"
              onPress={() => {
                const token = extractToken(manual);
                if (token) go(token);
              }}
              disabled={extractToken(manual) === null}
              full
            />
          </View>
        </Card>

        <Button label="Cancel" variant="quiet" onPress={() => router.back()} full />
      </View>
    </Screen>
  );
}
