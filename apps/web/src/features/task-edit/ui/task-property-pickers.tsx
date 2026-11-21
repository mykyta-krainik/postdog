"use client";

import { PRIORITIES, type Priority, type TaskStatus } from "@postdog/shared";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  PriorityIcon,
  StatusIcon,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  toggledStatus,
  updateTask,
  type TaskListItem,
} from "@/entities/task";
import { errorMessage } from "@/shared/lib/form-errors";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

type TaskRef = Pick<TaskListItem, "id" | "identifier" | "status" | "priority">;

/** Status and priority changes show at once. updateTask rolls them back if the API refuses. */
function changeTask(task: TaskRef, patch: { status: TaskStatus } | { priority: Priority }) {
  const field = "status" in patch ? "status" : "priority";
  updateTask(task.id, patch).catch((error: unknown) => {
    toast.error(`The ${field} of ${task.identifier} didn't change`, {
      description: errorMessage(error, "Try again."),
    });
  });
}

type Option<T extends string> = { value: T; label: string; icon: ReactNode };

const STATUS_OPTIONS: Option<TaskStatus>[] = TASK_STATUS_ORDER.map((status) => ({
  value: status,
  label: TASK_STATUS_META[status].label,
  icon: <StatusIcon status={status} />,
}));

const PRIORITY_OPTIONS: Option<Priority>[] = PRIORITIES.toReversed().map((priority) => ({
  value: priority,
  label: TASK_PRIORITY_META[priority].shortLabel,
  icon: <PriorityIcon priority={priority} />,
}));

function PropertyPicker<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  const current = options.find((option) => option.value === value) ?? options[0]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label={`${name}: ${current.label}`}
          className="h-10 gap-1.5 px-2.5 text-[13px] font-normal md:h-7"
        >
          {current.icon}
          {current.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            const option = options.find((candidate) => candidate.value === next);
            if (option && option.value !== value) onChange(option.value);
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="h-10 text-[13px] md:h-8"
            >
              {option.icon}
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TaskStatusPicker({ task }: { task: TaskRef }) {
  return (
    <PropertyPicker
      name="Status"
      value={task.status}
      options={STATUS_OPTIONS}
      onChange={(status) => changeTask(task, { status })}
    />
  );
}

export function TaskPriorityPicker({ task }: { task: TaskRef }) {
  return (
    <PropertyPicker
      name="Priority"
      value={task.priority}
      options={PRIORITY_OPTIONS}
      onChange={(priority) => changeTask(task, { priority })}
    />
  );
}

/** One click finishes an open subtask or reopens a done one. */
export function DoneToggle({ task, className }: { task: TaskRef; className?: string }) {
  const label =
    task.status === "done" ? `Reopen ${task.identifier}` : `Mark ${task.identifier} done`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => changeTask(task, { status: toggledStatus(task.status) })}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-md outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 md:size-7",
        className,
      )}
    >
      <StatusIcon status={task.status} className="size-4 md:size-3.5" />
    </button>
  );
}
