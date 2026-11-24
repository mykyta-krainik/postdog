'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  DARK_QUERY,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

const listeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

function readResolvedTheme(): ResolvedTheme {
  return resolveTheme(readPreference(), matchMedia(DARK_QUERY).matches);
}

function applyResolvedTheme() {
  const theme = readResolvedTheme();
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

function notify() {
  applyResolvedTheme();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setPreference(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be blocked. The theme still applies for this page view.
  }
  notify();
}

const serverPreference = (): ThemePreference => DEFAULT_THEME;
const serverResolvedTheme = (): ResolvedTheme => resolveTheme(DEFAULT_THEME, true);

export function useTheme() {
  const preference = useSyncExternalStore(subscribe, readPreference, serverPreference);
  const resolvedTheme = useSyncExternalStore(subscribe, readResolvedTheme, serverResolvedTheme);
  return { preference, resolvedTheme, setPreference };
}

/** Keeps the <html> class in sync with the OS theme and with other tabs. */
export function ThemeSync() {
  useEffect(() => {
    const media = matchMedia(DARK_QUERY);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) notify();
    };
    media.addEventListener('change', notify);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', notify);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return null;
}
