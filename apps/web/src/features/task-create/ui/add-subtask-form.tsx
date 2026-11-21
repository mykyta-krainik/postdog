"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createSubtasksInputSchema } from "@postdog/shared";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { mutate } from "swr";
import type { z } from "zod";
import { createSubtasks, taskKeys, type TaskDetail } from "@/entities/task";
import { ApiError } from "@/shared/api";
import { setApiErrors } from "@/shared/lib/form-errors";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

const subtaskSchema = createSubtasksInputSchema.shape.subtasks.element.pick({ title: true });
type SubtaskValues = z.input<typeof subtaskSchema>;

const resolver = zodResolver(subtaskSchema, {
  error: (issue) =>
    issue.code === "too_small"
      ? "Give the subtask a title."
      : issue.code === "too_big"
        ? "Keep the title under 200 characters."
        : undefined,
});

/**
 * Adds subtasks one title at a time. The field clears as soon as a title is sent, so the next one
 * can be typed while it saves. A failed add puts the title back. The API refuses the add when the
 * parent changed since it loaded. The parent is then refreshed, so pressing Enter again adds it.
 */
export function AddSubtaskForm({
  parent,
}: {
  parent: Pick<TaskDetail, "id" | "identifier" | "updatedAt">;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<SubtaskValues>({ resolver, defaultValues: { title: "" } });
  const { errors, isSubmitting } = form.formState;

  const close = () => {
    form.reset({ title: "" });
    setOpen(false);
  };

  const submit = form.handleSubmit(async ({ title }) => {
    form.setValue("title", "");
    form.setFocus("title");
    try {
      await createSubtasks(parent.id, { subtasks: [{ title }], baseUpdatedAt: parent.updatedAt });
    } catch (error) {
      if (form.getValues("title") === "") form.setValue("title", title);
      if (error instanceof ApiError && error.code === "stale") {
        await mutate(taskKeys.detail(parent.id));
        form.setError("root", {
          message: `${parent.identifier} changed after it loaded, so nothing was added. It's up to date now. Press Enter to add the subtask.`,
        });
        return;
      }
      setApiErrors(
        form,
        error,
        (path) => (path === "subtasks.0.title" ? "title" : undefined),
        "The subtask wasn't added. Try again.",
      );
    }
  });

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="h-10 justify-start gap-2 px-1.5 text-[13px] font-normal text-muted-foreground md:h-8"
      >
        <Plus className="size-4" aria-hidden />
        Add subtask
      </Button>
    );
  }

  const message = errors.title?.message ?? errors.root?.message;
  return (
    <form
      noValidate
      // A second Enter while the first add is in flight would add the subtask twice.
      onSubmit={(event) =>
        form.formState.isSubmitting ? event.preventDefault() : void submit(event)
      }
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          autoComplete="off"
          aria-label="Subtask title"
          placeholder="Subtask title"
          aria-invalid={errors.title ? true : undefined}
          className="h-10 text-[13px] md:h-8 md:text-[13px]"
          {...form.register("title")}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        />
        <Button type="submit" size="sm" disabled={isSubmitting} className="h-10 text-xs md:h-8">
          {isSubmitting ? "Adding…" : "Add"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={close}
          className="h-10 text-xs md:h-8"
        >
          Cancel
        </Button>
      </div>
      {message && (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
    </form>
  );
}
