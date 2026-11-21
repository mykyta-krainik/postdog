"use client";

import { AGENT_LIMITS } from "@postdog/shared";
import { LoaderCircle, MessageSquareText } from "lucide-react";
import { useState, type ReactNode } from "react";
import { isRunBusy } from "@/entities/agent-run";
import { useSettings } from "@/entities/settings";
import type { TaskDetail } from "@/entities/task";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import type { StatusUpdateScope } from "../model/status-update";
import { useStatusUpdate } from "../model/use-status-update";
import { StatusUpdateDialog } from "./status-update-dialog";
import { StatusUpdateFlow } from "./status-update-flow";

const WINDOW_HOURS = AGENT_LIMITS.statusUpdateDefaultWindowMs / 3_600_000;

/**
 * A button that opens one status update in a dialog. The first open starts the run, later opens
 * show where it is. Hidden while AI is off.
 */
function StatusUpdateEntry({
  scope,
  title,
  description,
  label,
  className,
  iconOnlyOnMobile = false,
}: {
  scope: StatusUpdateScope;
  title: string;
  description: ReactNode;
  label: string;
  className?: string;
  iconOnlyOnMobile?: boolean;
}) {
  const { aiEnabled } = useSettings();
  const updater = useStatusUpdate(scope);
  const [open, setOpen] = useState(false);

  if (!aiEnabled) return null;
  const busy = updater.view.kind === "run_state" && isRunBusy(updater.view.view);
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
          updater.begin();
        }}
      >
        <Icon
          className={cn("size-4 text-brand", busy && "animate-spin motion-reduce:animate-none")}
          aria-hidden
        />
        <span className={cn(iconOnlyOnMobile && "max-md:sr-only")}>{label}</span>
      </Button>
      <StatusUpdateDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
      >
        <StatusUpdateFlow updater={updater} />
      </StatusUpdateDialog>
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
      title="My update"
      description={`A Slack update on your tasks that changed in the last ${WINDOW_HOURS} hours.`}
      label="My update"
      className={className}
      iconOnlyOnMobile
    />
  );
}
