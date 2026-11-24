"use client";

import type { AgentRun } from "@postdog/shared";
import Link from "next/link";
import { toast } from "sonner";
import { DecomposeResult } from "@/features/decompose-tasks";
import { StatusUpdateRunResult } from "@/features/write-status-update";
import { AgentRunStatus, cancelRun, useAgentRun } from "@/entities/agent-run";
import { ApiError, aiRequest } from "@/shared/api";
import { routes } from "@/shared/config";
import { errorMessage } from "@/shared/lib/form-errors";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { startAgainLink, toRunResult } from "../model/run-result";
import { PlannerResult } from "./planner-result";

function cancel(runId: number) {
  aiRequest(cancelRun(runId)).catch((error: unknown) => {
    toast.error("The run is still going", {
      description: errorMessage(error, "Cancel didn't reach the API. Try again."),
    });
  });
}

function Result({ run }: { run: AgentRun }) {
  const result = toRunResult(run);
  switch (result.agent) {
    case "planner":
      return <PlannerResult run={result.run} />;
    case "status_updater":
      return <StatusUpdateRunResult run={result.run} />;
    case "decomposer":
      return <DecomposeResult run={result.run} />;
    case "unknown":
      return (
        <p className="text-[13px] text-muted-foreground">
          This page can&apos;t show the result of this run. The trace below shows what it did.
        </p>
      );
  }
}

function RunError({
  error,
  retrying,
  onRetry,
}: {
  error: unknown;
  retrying: boolean;
  onRetry: () => void;
}) {
  const gone = error instanceof ApiError && error.code === "not_found";
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">
          {gone ? "This run is gone" : "This run didn't load"}
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {gone
            ? "Postdog has no run with this number. Pick one from the list."
            : errorMessage(error, "The API returned an error.")}
        </p>
      </div>
      {gone ? (
        <Button asChild variant="outline" size="sm" className="h-10 md:h-8">
          <Link href={routes.runs} scroll={false}>
            Back to runs
          </Link>
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-10 md:h-8"
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? "Trying again…" : "Try again"}
        </Button>
      )}
    </div>
  );
}

/**
 * One run, loaded by id and polled while it runs: progress with Cancel, the result its agent
 * produced, or what failed with a link to where to start it again. Always the trace.
 */
export function RunDetail({ runId }: { runId: number }) {
  const { data: run, error, isValidating, mutate } = useAgentRun(runId);

  if (!run) {
    if (error) {
      return <RunError error={error} retrying={isValidating} onRetry={() => void mutate()} />;
    }
    return <Skeleton aria-label="Loading the run" className="h-16 w-full" />;
  }

  const again = startAgainLink(run);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <AgentRunStatus
        view={{ status: run.status, run }}
        agent={run.agent}
        onCancel={() => cancel(run.id)}
        result={(completed) => <Result run={completed} />}
      />
      {(run.status === "failed" || run.status === "cancelled") && (
        <Link
          href={again.href}
          className="flex min-h-10 items-center self-start rounded-md px-1.5 text-[13px] text-brand-text underline-offset-2 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring md:min-h-8"
        >
          {again.text}
        </Link>
      )}
    </div>
  );
}
