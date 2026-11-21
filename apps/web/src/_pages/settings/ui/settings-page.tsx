import type { Metadata } from "next";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Settings" };

export function SettingsPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center border-b border-border px-4 py-3 md:px-5">
        <h1 className="flex h-8 items-center text-[15px] font-semibold tracking-[-0.01em]">
          Settings
        </h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="w-full max-w-[640px] px-4 py-6 md:px-5 md:py-8">
          <SettingsView />
        </div>
      </div>
    </main>
  );
}
