"use client";

import { AGENT_LIMITS } from "@postdog/shared";
import { LoaderCircle, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AgentDialog, findRunning, isRunBusy, useRunningRuns } from "@/entities/agent-run";
import { useSettings } from "@/entities/settings";
import type { TaskDetail } from "@/entities/task";
import { routes } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import type { StatusUpdateScope } from "../model/status-update";
import { useStatusUpdate } from "../model/use-status-update";
import { StatusUpdateFlow } from "./status-update-flow";

const WINDOW_HOURS = AGENT_LIMITS.statusUpdateDefaultWindowMs / 3_600_000;

/**
 * A button that opens one status update in a dialog. The first open starts the run, later opens
 * show where it is. When a run for the same scope is already going, started in another tab or
 * before the user left, the dialog links to it on the Runs page instead. Hidden while AI is off.
 */
function StatusUpdateEntry({
  scope,
  taskIdentifier,
  title,
  description,
  label,
  className,
  iconOnlyOnMobile = false,
}: {
  scope: StatusUpdateScope;
  /** The task an update is for, as the run's label names it. Null for My update. */
  taskIdentifier: string | null;
  title: string;
  description: ReactNode;
  label: string;
  className?: string;
  iconOnlyOnMobile?: boolean;
}) {
  const { aiEnabled } = useSettings();
  const updater = useStatusUpdate(scope);
  const { runs } = useRunningRuns(aiEnabled);
  const [open, setOpen] = useState(false);

  if (!aiEnabled) return null;
  const elsewhere = findRunning(runs, { agent: "status_updater", taskIdentifier }, updater.runId);
  const idle = updater.view.kind === "idle";
  const busy =
    (updater.view.kind === "run_state" && isRunBusy(updater.view.view)) ||
    (idle && elsewhere !== undefined);
  const Icon = busy ? LoaderCircle : MessageSquareText;

  return (
    <>
      <Button
        variant="outline"
        aria-label={iconOnlyOnMobile ? label : undefined}
        title={iconOnlyOnMobile ? label : undefined}
        className={cn(
          "h-10 gap-1.5 border-brand/40 px-3 text-[13px] hover:border-brand/70 md:h-8",
          iconOnlyOnMobile && "max-md:w-10 max-md:px-0",
          className,
        )}
        onClick={() => {
          setOpen(true);
          if (!elsewhere) updater.begin();
        }}
      >
        <Icon
          className={cn("size-4 text-brand", busy && "animate-spin motion-reduce:animate-none")}
          aria-hidden
        />
        <span className={cn(iconOnlyOnMobile && "max-md:sr-only")}>{label}</span>
      </Button>
      <AgentDialog open={open} onOpenChange={setOpen} title={title} description={description}>
        {!idle ? (
          <StatusUpdateFlow updater={updater} />
        ) : elsewhere ? (
          <p role="status" className="text-[13px] text-muted-foreground">
            This update is already being written.{" "}
            <Link
              href={routes.run(elsewhere.id)}
              className="text-brand-text underline underline-offset-2"
              onClick={() => setOpen(false)}
            >
              Watch it on the Runs page
            </Link>
          </p>
        ) : (
          <Button
            size="sm"
            className="h-10 self-start px-3 text-[13px] md:h-8"
            onClick={updater.begin}
          >
            Write update
          </Button>
        )}
      </AgentDialog>
    </>
  );
}

/** "Write status update" for one task, with its subtasks and notes. Key it by task id. */
export function WriteStatusUpdateButton({
  task,
  className,
}: {
  task: Pick<TaskDetail, "id" | "identifier" | "title">;
  className?: string;
}) {
  return (
    <StatusUpdateEntry
      scope={{ scope: "task", taskId: task.id }}
      taskIdentifier={task.identifier}
      title="Status update"
      description={
        <>
          A Slack update for <span className="text-foreground tabular-nums">{task.identifier}</span>{" "}
          {task.title}, from its status, subtasks and notes.
        </>
      }
      label="Write status update"
      className={className}
    />
  );
}

/** "My update" for the Tasks toolbar: the tasks that changed in the server's default window. */
export function MyUpdateButton({ className }: { className?: string }) {
  return (
    <StatusUpdateEntry
      scope={{ scope: "since" }}
      taskIdentifier={null}
      title="My update"
      description={`A Slack update on your tasks that changed in the last ${WINDOW_HOURS} hours.`}
      label="My update"
      className={className}
      iconOnlyOnMobile
    />
  );
}
