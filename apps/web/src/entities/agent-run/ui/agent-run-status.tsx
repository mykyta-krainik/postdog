"use client";

import type { AgentName, AgentRun } from "@postdog/shared";
import { AlertTriangle, CircleSlash, LoaderCircle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { errorMessage } from "@/shared/lib/form-errors";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { AGENT_ERROR_LABEL, AGENT_META } from "../model/agents";
import type { RunView } from "../model/run-view";
import { progressText } from "../model/trace";
import { TraceTimeline } from "./trace-timeline";

const ACTION_BUTTON = "h-10 shrink-0 gap-1.5 px-3 text-[13px] md:h-8";

function Notice({
  tone,
  icon,
  title,
  action,
  children,
}: {
  tone: "error" | "quiet";
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-md border px-3 py-2.5",
        tone === "error" ? "border-destructive/35 bg-destructive/5" : "border-border bg-muted/40",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        {children}
      </div>
      {action}
    </div>
  );
}

function RetryButton({ onRetry, label = "Retry" }: { onRetry?: () => void; label?: string }) {
  if (!onRetry) return null;
  return (
    <Button variant="outline" size="sm" className={ACTION_BUTTON} onClick={onRetry}>
      <RotateCw className="size-3.5" aria-hidden />
      {label}
    </Button>
  );
}

function Working({
  agent,
  run,
  onCancel,
}: {
  agent: AgentName;
  run?: AgentRun;
  onCancel: () => void;
}) {
  const trace = run?.trace ?? [];
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-md border border-brand/30 bg-brand-soft/60 px-3 py-2"
    >
      <LoaderCircle
        className="size-4 shrink-0 animate-spin text-brand motion-reduce:animate-none"
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-[13px] font-medium text-foreground">
          {AGENT_META[agent].working}…
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {progressText(trace)}
          {trace.length > 0 && <span className="ml-2 tabular-nums">Step {trace.length}</span>}
        </p>
      </div>
      {run && (
        <Button variant="ghost" size="sm" className={ACTION_BUTTON} onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  );
}

/**
 * The UX states of one AI action: running with staged progress and Cancel, then the result,
 * or what failed with Retry and the trace. Idle renders nothing. `result` renders a completed
 * run above its trace; leave it out when the caller shows the result elsewhere. Without
 * `onRetry`, a failed or cancelled run shows no Retry, for places that only look at a run.
 */
export function AgentRunStatus<Run extends AgentRun>({
  view,
  agent,
  onCancel,
  onRetry,
  result,
  className,
}: {
  view: RunView<Run>;
  agent: AgentName;
  onCancel: () => void;
  onRetry?: () => void;
  result?: (run: Run) => ReactNode;
  className?: string;
}) {
  const label = AGENT_META[agent].label;

  const body = (() => {
    switch (view.status) {
      case "idle":
        return null;
      case "starting":
        return <Working agent={agent} onCancel={onCancel} />;
      case "running":
        return <Working agent={agent} run={view.run} onCancel={onCancel} />;
      case "completed":
        return (
          <>
            {result?.(view.run)}
            <TraceTimeline trace={view.run.trace} />
          </>
        );
      case "failed": {
        const error = view.run.error;
        return (
          <>
            <Notice
              tone="error"
              icon={<AlertTriangle className="size-4 text-destructive" aria-hidden />}
              title={`The ${label.toLowerCase()} run failed`}
              action={<RetryButton onRetry={onRetry} />}
            >
              <p className="text-[13px] text-muted-foreground">
                {error
                  ? `${AGENT_ERROR_LABEL[error.code]}. ${error.message}`
                  : "The API gave no reason."}
              </p>
              {error && (
                <p className="text-xs text-muted-foreground">
                  Error code <span className="text-foreground/80">{error.code}</span>
                </p>
              )}
            </Notice>
            <TraceTimeline trace={view.run.trace} />
          </>
        );
      }
      case "cancelled":
        return (
          <>
            <Notice
              tone="quiet"
              icon={<CircleSlash className="size-4 text-muted-foreground" aria-hidden />}
              title="You cancelled this run"
              action={<RetryButton onRetry={onRetry} label="Run again" />}
            />
            <TraceTimeline trace={view.run.trace} />
          </>
        );
      case "request_failed":
        return (
          <Notice
            tone="error"
            icon={<AlertTriangle className="size-4 text-destructive" aria-hidden />}
            title={`The ${label.toLowerCase()} didn't start`}
            action={<RetryButton onRetry={onRetry} />}
          >
            <p className="text-[13px] text-muted-foreground">
              {errorMessage(view.error, "The API returned an error.")}
            </p>
          </Notice>
        );
    }
  })();

  if (!body) return null;
  return <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>{body}</div>;
}
