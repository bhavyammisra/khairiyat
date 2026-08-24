import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from './supabase';
import type { Family, Member } from './types';

type SessionState = {
  loading: boolean;
  session: Session | null;
  /** The member row this signed-in person holds. Null until they create or
   *  join a family — a signed-in user with no family is a real state. */
  member: Member | null;
  family: Family | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState>({
  loading: true,
  session: null,
  member: null,
  family: null,
  refresh: async () => undefined,
  signOut: async () => undefined,
});

export const useSession = (): SessionState => useContext(SessionContext);

type MemberWithFamily = Member & { family: Family | null };

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [family, setFamily] = useState<Family | null>(null);

  const loadMember = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setMember(null);
      setFamily(null);
      return;
    }

    const { data } = await supabase
      .from('members')
      .select('*, family:families(*)')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle<MemberWithFamily>();

    setMember(data ?? null);
    setFamily(data?.family ?? null);
  }, []);

  useEffect(() => {
    let active = true;

    /**
     * Stay `loading` until the member row has actually been fetched.
     *
     * Otherwise app/index.tsx sees a session with member still null — the
     * query is in flight — and redirects a signed-in caregiver to
     * "join a family", asking for the family code they already used.
     */
    const sync = async (next: Session | null) => {
      if (!active) return;
      setLoading(true);
      setSession(next);
      await loadMember(next?.user.id);
      if (active) setLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => sync(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      void sync(next);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadMember]);

  const refresh = useCallback(async () => {
    await loadMember(session?.user.id);
  }, [loadMember, session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setMember(null);
    setFamily(null);
  }, []);

  const value = useMemo(
    () => ({ loading, session, member, family, refresh, signOut }),
    [loading, session, member, family, refresh, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};
