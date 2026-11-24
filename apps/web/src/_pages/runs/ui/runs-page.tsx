import type { Metadata } from "next";
import { Suspense } from "react";
import { RunsHeader, RunsView } from "./runs-view";

export const metadata: Metadata = { title: "Runs" };

/** The open run lives in a search param, which only the client reads, so the view renders inside Suspense. */
export function RunsPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<RunsHeader />}>
        <RunsView />
      </Suspense>
    </main>
  );
}
