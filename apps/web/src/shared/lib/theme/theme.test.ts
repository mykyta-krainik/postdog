import { describe, expect, it } from "vitest";
import {
  THEME_PREFERENCES,
  parseThemePreference,
  resolveTheme,
  themeInitScript,
  type ResolvedTheme,
} from "./theme";

/** Runs the head script against a fake document and returns the theme it applied. */
function runInitScript(stored: string | null, systemPrefersDark: boolean): ResolvedTheme {
  const classes = new Set<string>();
  const root = {
    classList: {
      toggle: (name: string, on: boolean) => (on ? classes.add(name) : classes.delete(name)),
      add: (name: string) => classes.add(name),
    },
    style: { colorScheme: "" },
  };
  new Function("document", "localStorage", "matchMedia", themeInitScript)(
    { documentElement: root },
    { getItem: () => stored },
    () => ({ matches: systemPrefersDark }),
  );
  return classes.has("dark") ? "dark" : "light";
}

describe("theme", () => {
  it("defaults to dark for a missing or unknown stored value", () => {
    expect(parseThemePreference(null)).toBe("dark");
    expect(parseThemePreference("sepia")).toBe("dark");
  });

  it("follows the OS only for the system preference", () => {
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it.each([null, "sepia", ...THEME_PREFERENCES])(
    "the head script applies the same theme as the app for stored %s",
    (stored) => {
      for (const systemPrefersDark of [true, false]) {
        expect(runInitScript(stored, systemPrefersDark)).toBe(
          resolveTheme(parseThemePreference(stored), systemPrefersDark),
        );
      }
    },
  );
});
