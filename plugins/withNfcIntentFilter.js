/**
 * Adds the NFC tag-dispatch intent filter to MainActivity.
 *
 * Android does NOT dispatch an NFC tag with ACTION_VIEW. Reading an NDEF tag
 * fires android.nfc.action.NDEF_DISCOVERED, and if nothing handles that it
 * falls through to TECH_DISCOVERED then TAG_DISCOVERED — never to VIEW. With
 * only the VIEW filter, Android reports "no supported app for this NFC tag".
 *
 * This cannot be expressed in app.json: Expo renders intent filter actions as
 * `android.intent.action.${action}`, and NDEF_DISCOVERED lives in the
 * android.nfc.action namespace.
 *
 * React Native's LinkingModule already treats ACTION_NDEF_DISCOVERED like
 * ACTION_VIEW when reading the launch intent, so expo-router resolves
 * khairiyat://t/<token> from the tag with no extra JS.
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const SCHEME = 'khairiyat';
const HOST = 't';

const withNfcIntentFilter = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const application = manifest.manifest.application?.[0];

    if (!application) {
      throw new Error('withNfcIntentFilter: no <application> in AndroidManifest.');
    }

    const activities = application.activity ?? [];
    const main = activities.find((activity) =>
      String(activity.$?.['android:name'] ?? '').endsWith('MainActivity'),
    );

    if (!main) {
      throw new Error('withNfcIntentFilter: MainActivity not found in AndroidManifest.');
    }

    main['intent-filter'] = main['intent-filter'] ?? [];

    const already = main['intent-filter'].some((filter) =>
      (filter.action ?? []).some(
        (action) => action.$?.['android:name'] === 'android.nfc.action.NDEF_DISCOVERED',
      ),
    );

    if (!already) {
      main['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.nfc.action.NDEF_DISCOVERED' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:scheme': SCHEME, 'android:host': HOST } }],
      });
    }

    // A host-less VIEW filter, so every khairiyat:// link resolves — not only
    // khairiyat://t/<token>.
    //
    // Android matches data by attribute pools: once ANY host is declared on a
    // filter, the URI's host must match one of them. Expo merges the app
    // scheme into the existing filter rather than adding its own whenever a
    // valid one is already present, so the host="t" above would otherwise make
    // khairiyat://scan (the Scan widget's deep link) unroutable.
    const hasBareScheme = main['intent-filter'].some((filter) =>
      (filter.data ?? []).some(
        (entry) =>
          entry.$?.['android:scheme'] === SCHEME && !entry.$?.['android:host'],
      ),
    );

    if (!hasBareScheme) {
      main['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        category: [
          { $: { 'android:name': 'android.intent.category.DEFAULT' } },
          { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
        ],
        data: [{ $: { 'android:scheme': SCHEME } }],
      });
    }

    return cfg;
  });

module.exports = withNfcIntentFilter;
