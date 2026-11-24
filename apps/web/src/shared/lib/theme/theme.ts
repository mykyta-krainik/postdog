export const THEME_PREFERENCES = ['dark', 'light', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const DEFAULT_THEME: ThemePreference = 'dark';
export const THEME_STORAGE_KEY = 'postdog-theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function parseThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.find((theme) => theme === value) ?? DEFAULT_THEME;
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

/**
 * Runs in <head> before first paint, so the stored theme applies without a flash.
 * It repeats parseThemePreference and resolveTheme in plain ES5 because it ships as a string.
 */
export const themeInitScript = `(function(){var d=document.documentElement;try{var p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(p!=="light"&&p!=="system")p=${JSON.stringify(DEFAULT_THEME)};var dark=p==="dark"||(p==="system"&&matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches);d.classList.toggle("dark",dark);d.style.colorScheme=dark?"dark":"light"}catch(e){d.classList.add("dark")}})()`;
