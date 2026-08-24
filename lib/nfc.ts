/**
 * NFC tag writing.
 *
 * NEVER assume NFC exists. Every entry point here feature-detects and the UI
 * falls back to the QR scanner, because the device may have no NFC hardware
 * and there is no emulator path to test against.
 *
 * Tags carry the custom scheme `khairiyat://t/<token>`. Do not write an https
 * URL — no domain is configured and Android would open a browser instead of
 * the app.
 */

import NfcManager, {
  Ndef,
  NfcEvents,
  NfcTech,
  type TagEvent,
} from 'react-native-nfc-manager';

export const tokenUri = (token: string): string => `khairiyat://t/${token}`;

/** 12 characters, url-safe, random. Matches the shape seeded in seed.sql. */
export const generateToken = (): string => {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 12; i += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)] ?? 'x';
  }
  return token;
};

let started = false;

/** True only when the hardware exists AND the manager started cleanly. */
export const isNfcAvailable = async (): Promise<boolean> => {
  try {
    const supported = await NfcManager.isSupported();
    if (!supported) return false;

    if (!started) {
      await NfcManager.start();
      started = true;
    }

    return true;
  } catch {
    return false;
  }
};

export type WriteResult = { ok: true } | { ok: false; reason: string };

/**
 * Holds the radio open until a tag is presented. Always paired with
 * `cancelWrite` so a cancelled screen does not leave the reader running.
 */
export const writeToken = async (token: string): Promise<WriteResult> => {
  try {
    const available = await isNfcAvailable();
    if (!available) {
      return { ok: false, reason: 'This phone cannot write stickers. Use the QR code instead.' };
    }

    await NfcManager.requestTechnology(NfcTech.Ndef);

    const message = Ndef.encodeMessage([Ndef.uriRecord(tokenUri(token))]);
    if (!message) {
      return { ok: false, reason: 'Could not prepare the sticker. Try again.' };
    }

    await NfcManager.ndefHandler.writeNdefMessage(message);
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: 'Could not write that sticker. Hold the phone against it a second longer.',
    };
  } finally {
    void NfcManager.cancelTechnologyRequest().catch(() => undefined);
  }
};

/**
 * Reads tags while the app is in the foreground.
 *
 * Insurance for the tag-dispatch path: if the NDEF_DISCOVERED intent filter
 * is missing from the installed build, Android refuses to launch the app from
 * a tap, but a foreground listener still sees the tag. Returns an unsubscribe.
 */
export const listenForTags = (onToken: (token: string) => void): (() => void) => {
  let cancelled = false;

  const start = async () => {
    const available = await isNfcAvailable();
    if (!available || cancelled) return;

    NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag: TagEvent | null) => {
      const records = tag?.ndefMessage ?? [];

      for (const record of records) {
        if (!record.payload) continue;

        // URI records prefix the payload with an abbreviation byte.
        const bytes = Array.from(record.payload as number[]).slice(1);
        const text = String.fromCharCode(...bytes);
        const match = /khairiyat:\/\/t\/([A-Za-z0-9_-]+)/.exec(text);

        if (match?.[1]) {
          onToken(match[1]);
          return;
        }
      }
    });

    await NfcManager.registerTagEvent();
  };

  void start();

  return () => {
    cancelled = true;
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    void NfcManager.unregisterTagEvent().catch(() => undefined);
  };
};

export const cancelWrite = async (): Promise<void> => {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {
    // Nothing was pending. Fine.
  }
};
