import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase credentials. Put EXPO_PUBLIC_SUPABASE_URL and ' +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, then restart the dev server — ' +
      'Expo reads EXPO_PUBLIC_* at build time, so a live reload will not pick them up.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // The parent's phone is signed in once during setup and stays signed in.
    // A tap must work from a cold start with no login prompt.
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
