import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, View } from 'react-native';

import { Button, Card, DoseRing, FadeIn, Icon, Screen, Text } from '../../components/ui';
import {
  checkInNudge,
  checkInSentence,
  readCallLog,
  recordCall,
  type CallLog,
} from '../../lib/checkin';
import { doseStateLabel, formatTime, isTaken, needsAttention } from '../../lib/doses';
import { ensureToday, loadFamilyToday, type FamilySnapshot } from '../../lib/family';
import { registerForPush, scheduleCheckInReminder } from '../../lib/notifications';
import { flush } from '../../lib/queue';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import type { DoseWindow, Member } from '../../lib/types';
import { buildSnapshot, writeSnapshot } from '../../lib/widget';

const empty: FamilySnapshot = { members: [], medications: [], windows: [] };

export default function Dashboard() {
  const { family } = useSession();
  const [data, setData] = useState<FamilySnapshot>(empty);
  const [refreshing, setRefreshing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Until the first load lands, "no medications yet" is a lie — don't flash it.
  const [loaded, setLoaded] = useState(false);
  const [callLog, setCallLog] = useState<CallLog>({});

  const refresh = useCallback(async () => {
    if (!family) return;
    setRefreshing(true);
    await flush();
    setProblem(await ensureToday(family.id));

    const snapshot = await loadFamilyToday(family.id);
    setData(snapshot);
    setRefreshing(false);
    setLoaded(true);

    // The widget cannot reach Supabase, so leave it something to render.
    void writeSnapshot(
      buildSnapshot(family.name, snapshot.members, snapshot.windows, snapshot.medications),
    );

    // Doses are only half of it. Nobody can visit, so the call is the visit.
    const log = await readCallLog();
    setCallLog(log);
    void scheduleCheckInReminder(checkInNudge(snapshot.members, log));
  }, [family]);

  // So the server can reach this caregiver when a dose goes unconfirmed.
  useEffect(() => {
    void registerForPush();
  }, []);

  useEffect(() => {
    void refresh();

    // Windows are generated lazily on foreground — there is no scheduler.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    return () => subscription.remove();
  }, [refresh]);

  // A ring filling while nobody touched the phone is the demo.
  const familyId = family?.id;

  useEffect(() => {
    if (!familyId) return;

    // The topic must be unique per mount. supabase.channel() hands back the
    // EXISTING channel for a repeated topic, and removeChannel resolves
    // asynchronously — so remounting the dashboard (returning from
    // add-medication, say) would call .on() on a channel that has already
    // subscribed, which throws.
    const channel = supabase
      .channel(`doses:${familyId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dose_windows',
          filter: `family_id=eq.${familyId}`,
        },
        () => {
          void loadFamilyToday(familyId).then(setData);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [familyId]);

  const medicationName = (id: string) =>
    data.medications.find((m) => m.id === id)?.name ?? 'Medication';

  const memberById = (id: string) => data.members.find((m) => m.id === id);

  const attention = data.windows.filter((w) => needsAttention(w.state));
  const tracked = data.members.filter((m) =>
    data.windows.some((w) => w.member_id === m.id),
  );

  const nudge = checkInNudge(data.members, callLog);

  const call = (person: Member | undefined) => {
    if (!person?.phone) return;

    // Record before opening the dialer: once the call app takes over we may
    // never be resumed. Better to count a call she did not pick up than to
    // keep nagging about one that happened.
    void recordCall(person.id).then(() => void readCallLog().then(setCallLog));
    void Linking.openURL(`tel:${person.phone}`);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={{ gap: space[7] }}>
        <View style={{ gap: space[1] }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text variant="title">{family?.name ?? 'Your family'}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => router.push('/(caregiver)/settings')}
              hitSlop={space[4]}
            >
              <Icon name="gear" size={space[6]} color="textSecondary" />
            </Pressable>
          </View>
          <Text variant="caption" color="textMuted">
            Code · {family?.join_code ?? '······'}
          </Text>
        </View>

        {problem ? (
          <Card tone="red">
            <View style={{ gap: space[2] }}>
              <Text variant="bodyStrong">Today&apos;s doses could not be worked out.</Text>
              <Text variant="caption" color="textSecondary">
                {problem}
              </Text>
            </View>
          </Card>
        ) : null}

        {attention.length > 0 ? (
          <View style={{ gap: space[3] }}>
            <Text variant="eyebrow" color="textMuted">
              Needs attention
            </Text>

            {attention.map((window, index) => {
              const person = memberById(window.member_id);

              return (
                <FadeIn key={window.id} index={index}>
                  <Card tone="amber">
                    <View style={{ gap: space[3] }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: space[3],
                        }}
                      >
                        <DoseRing state={window.state} size={24} decorative />
                        <Text variant="bodyStrong">
                          {person?.name ?? 'Someone'} · {medicationName(window.medication_id)}
                        </Text>
                      </View>

                      {/* Never "missed". We do not know that. */}
                      <Text color="textSecondary">
                        No confirmation for {formatTime(window.scheduled_at)}
                      </Text>

                      <View style={{ flexDirection: 'row', gap: space[3] }}>
                        {person?.phone ? (
                          <Button
                            label={`Call ${person.name}`}
                            variant="secondary"
                            onPress={() => call(person)}
                          />
                        ) : null}
                        <Button
                          label="Resolve"
                          onPress={() =>
                            router.push({
                              pathname: '/(caregiver)/resolve',
                              params: {
                                id: window.id,
                                name: person?.name ?? '',
                                medication: medicationName(window.medication_id),
                                time: formatTime(window.scheduled_at),
                              },
                            })
                          }
                        />
                      </View>
                    </View>
                  </Card>
                </FadeIn>
              );
            })}
          </View>
        ) : null}

        {/* Doses say a pill was taken. They do not say she is all right, and
            for ninety days nobody can drop in and find out. */}
        {nudge ? (
          <Card>
            <View style={{ gap: space[3] }}>
              <Text variant="bodyStrong">{checkInSentence(nudge)}</Text>
              <Text variant="caption" color="textSecondary">
                Her doses are being logged. That is not the same as hearing her voice.
              </Text>
              {memberById(nudge.memberId)?.phone ? (
                <Button
                  label={`Call ${nudge.name}`}
                  variant="secondary"
                  onPress={() => call(memberById(nudge.memberId))}
                />
              ) : (
                <Text variant="caption" color="textMuted">
                  Add her number on her page to call from here.
                </Text>
              )}
            </View>
          </Card>
        ) : null}

        <View style={{ gap: space[3] }}>
          <Text variant="eyebrow" color="textMuted">
            Today
          </Text>

          {!loaded ? null : tracked.length === 0 ? (
            <Card>
              <View style={{ gap: space[3] }}>
                <Text color="textSecondary">
                  No medications yet. Add the first one to start tracking.
                </Text>
                <Button
                  label="Add a medication"
                  onPress={() => router.push('/(caregiver)/add-medication')}
                />
              </View>
            </Card>
          ) : (
            tracked.map((person, index) => (
              <FadeIn key={person.id} index={index}>
                <MemberRow
                  person={person}
                  windows={data.windows.filter((w) => w.member_id === person.id)}
                  onPress={() =>
                    router.push({
                      pathname: '/(caregiver)/member',
                      params: { id: person.id, name: person.name },
                    })
                  }
                />
              </FadeIn>
            ))
          )}
        </View>

        <View style={{ gap: space[3] }}>
          <Button
            label="Scan a code"
            icon="qr"
            variant="secondary"
            onPress={() => router.push('/(caregiver)/scan')}
            full
          />
          {tracked.length > 0 ? (
            <Button
              label="Add a medication"
              variant="quiet"
              onPress={() => router.push('/(caregiver)/add-medication')}
              full
            />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const MemberRow = ({
  person,
  windows,
  onPress,
}: {
  person: Member;
  windows: DoseWindow[];
  onPress: () => void;
}) => {
  const confirmed = windows.filter((w) => isTaken(w.state)).length;

  const summary =
    confirmed === windows.length
      ? `${windows.length} ${windows.length === 1 ? 'dose' : 'doses'} · all confirmed`
      : `${windows.length} ${windows.length === 1 ? 'dose' : 'doses'} · ${confirmed} confirmed`;

  return (
    <Card onPress={onPress}>
      <View style={{ gap: space[2] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text variant="name">{person.name}</Text>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {windows.map((window) => (
              // Nothing but shapes beside her name, so each one says itself.
              <DoseRing
                key={window.id}
                state={window.state}
                size={20}
                label={`${formatTime(window.scheduled_at)}, ${doseStateLabel(window.state)}`}
              />
            ))}
          </View>
        </View>

        <Text variant="caption" color="textSecondary">
          {summary}
        </Text>

        {/* Never state by colour alone — the shapes above get a text reading. */}
        <Text variant="caption" color="textMuted">
          {windows.map((w) => `${formatTime(w.scheduled_at)} ${doseStateLabel(w.state)}`).join(' · ')}
        </Text>
      </View>
    </Card>
  );
};
