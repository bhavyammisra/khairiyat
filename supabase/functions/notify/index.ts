/**
 * Sends the alerts that sweep_unconfirmed() queued.
 *
 * Deploy:
 *   supabase functions deploy notify
 *
 * Two layers of auth, because neither is sufficient alone:
 *
 *   1. Supabase's own JWT verification (leave it ON). It rejects anonymous
 *      callers outright.
 *   2. A shared secret this function checks itself. Supabase's new-style
 *      `sb_secret_...` keys are NOT JWTs, so verify_jwt can never accept one —
 *      which leaves the anon key as the only convenient JWT, and that key is
 *      public because it ships inside the app bundle. The secret is what
 *      actually stops a stranger triggering this.
 *
 * Set the secret in the dashboard under Edge Functions → Secrets:
 *   NOTIFY_SECRET = <a long random string>
 * and send it from the scheduler as the x-khairiyat-secret header.
 *
 * Idempotent: alerts are marked sent, and the unique index on dose_window_id
 * means a dose is never alerted twice.
 *
 * Runs with the service role key, so it bypasses RLS — it must, because it
 * acts on behalf of no signed-in user.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

type PendingAlert = {
  alert_id: string;
  dose_window_id: string;
  member_name: string;
  medication_name: string;
  scheduled_at: string;
  created_at: string;
  push_tokens: string[];
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * How long to keep waiting for a caregiver device to appear before giving up
 * on an alert. Marking it sent immediately would mean a family that installs
 * the app before enabling notifications loses every early alert.
 */
const GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000;

const timeOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

/** Constant-time-ish compare, so the secret cannot be probed byte by byte. */
const secretMatches = (given: string | null, expected: string): boolean => {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
};

Deno.serve(async (request) => {
  const expected = Deno.env.get('NOTIFY_SECRET');

  if (!expected) {
    return Response.json(
      { error: 'NOTIFY_SECRET is not set on this function.' },
      { status: 500 },
    );
  }

  if (!secretMatches(request.headers.get('x-khairiyat-secret'), expected)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const swept = await supabase.rpc('sweep_unconfirmed');
  if (swept.error) {
    return Response.json({ error: swept.error.message }, { status: 500 });
  }

  const { data, error } = await supabase.rpc('pending_alerts', { p_limit: 50 });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const alerts = (data ?? []) as PendingAlert[];
  let sent = 0;
  let waiting = 0;
  let abandoned = 0;

  for (const alert of alerts) {
    if (alert.push_tokens.length === 0) {
      const age = Date.now() - Date.parse(alert.created_at);

      // Leave it pending: a caregiver may register a device shortly. Only give
      // up once it is too old to be worth delivering.
      if (age < GIVE_UP_AFTER_MS) {
        waiting += 1;
        continue;
      }

      await supabase.rpc('mark_alert_sent', { p_alert_id: alert.alert_id });
      abandoned += 1;
      continue;
    }

    // Never blame her. We do not know the dose was missed.
    const messages = alert.push_tokens.map((to) => ({
      to,
      sound: 'default',
      title: `No confirmation from ${alert.member_name}`,
      body: `${alert.medication_name} at ${timeOf(alert.scheduled_at)} hasn't been confirmed. Give her a call?`,
      data: { doseWindowId: alert.dose_window_id },
      channelId: 'doses',
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    if (response.ok) {
      await supabase.rpc('mark_alert_sent', { p_alert_id: alert.alert_id });
      sent += messages.length;
    }
  }

  return Response.json({
    newAlerts: swept.data,
    considered: alerts.length,
    sent,
    waitingForDevice: waiting,
    abandoned,
  });
});
