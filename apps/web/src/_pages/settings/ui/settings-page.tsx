import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

/** Placeholder until the settings page lands: AI switch, decomposition mode and theme. */
export function SettingsPage() {
  return (
    <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
      <h1 className="text-[15px] font-semibold">Settings</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        The AI switch, decomposition mode and theme picker will live here.
      </p>
    </main>
  );
}
