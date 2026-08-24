import AsyncStorage from '@react-native-async-storage/async-storage';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import {
  palette,
  THEME_STORAGE_KEY,
  ThemeContext,
  type ColorScheme,
  type ThemePreference,
} from '../../lib/theme';

const isPreference = (value: string | null): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

/**
 * Resolves the colour scheme from system preference by default, overridable in
 * Settings and persisted to AsyncStorage.
 *
 * Both themes must be visually finished at all times — dark mode is not an
 * afterthought here, it gets shown on stage.
 */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const system = useColorScheme();
  const [preference, setStored] = useState<ThemePreference>('system');

  useEffect(() => {
    void AsyncStorage.getItem(THEME_STORAGE_KEY).then((value) => {
      if (isPreference(value)) setStored(value);
    });
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setStored(next);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  const scheme: ColorScheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({ scheme, color: palette[scheme], preference, setPreference }),
    [scheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
