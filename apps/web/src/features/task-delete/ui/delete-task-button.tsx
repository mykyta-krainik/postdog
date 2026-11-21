"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { deleteTask, type TaskDetail } from "@/entities/task";
import { errorMessage } from "@/shared/lib/form-errors";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";

type DeletableTask = Pick<TaskDetail, "id" | "identifier" | "title" | "subtasks">;

function whatGoes(task: DeletableTask): string {
  const subtasks = task.subtasks.length;
  if (subtasks === 0) return "Its notes and links go with it.";
  return `Its ${subtasks === 1 ? "subtask" : `${subtasks} subtasks`}, notes and links go with it.`;
}

/** A delete button that asks first. onDeleted runs after the API confirms. */
export function DeleteTaskButton({
  task,
  onDeleted,
  className,
}: {
  task: DeletableTask;
  onDeleted: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const confirm = async () => {
    setPending(true);
    setError(undefined);
    try {
      await deleteTask(task.id);
      setOpen(false);
      toast.success(`Deleted ${task.identifier}`, { description: task.title });
      onDeleted();
    } catch (deleteError) {
      setError(errorMessage(deleteError, "The task wasn't deleted. Try again."));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${task.identifier}`}
          title="Delete task"
          className={className}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="gap-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Delete {task.identifier}?</DialogTitle>
          <DialogDescription className="text-[13px]">
            “{task.title}” will be deleted. {whatGoes(task)} This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" className="h-10 md:h-8">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => void confirm()}
            className="h-10 md:h-8"
          >
            {pending ? "Deleting…" : "Delete task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
