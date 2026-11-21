"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createNoteInputSchema } from "@postdog/shared";
import { useForm, useWatch } from "react-hook-form";
import type { z } from "zod";
import { createNote } from "@/entities/task";
import { setApiErrors } from "@/shared/lib/form-errors";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";

type NoteValues = z.input<typeof createNoteInputSchema>;

const MAX_LENGTH = createNoteInputSchema.shape.body.maxLength ?? 5000;
/** The counter shows once a note gets close to the limit. */
const COUNTER_FROM = MAX_LENGTH - 500;

const resolver = zodResolver(createNoteInputSchema, {
  error: (issue) =>
    issue.code === "too_small"
      ? "Write something first."
      : issue.code === "too_big"
        ? `Keep notes under ${MAX_LENGTH.toLocaleString("en")} characters.`
        : undefined,
});

export function AddNoteForm({ taskId }: { taskId: number }) {
  const form = useForm<NoteValues>({ resolver, defaultValues: { body: "" } });
  const { errors, isSubmitting } = form.formState;
  const length = useWatch({ control: form.control, name: "body" }).length;

  const submit = form.handleSubmit(async (values) => {
    try {
      await createNote(taskId, values);
      form.reset({ body: "" });
    } catch (error) {
      setApiErrors(
        form,
        error,
        (path) => (path === "body" ? "body" : undefined),
        "The note wasn't added. Try again.",
      );
    }
  });

  const message = errors.body?.message ?? errors.root?.message;
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2">
      <Textarea
        aria-label="New note, in markdown"
        placeholder="Add a note: progress, a blocker, a decision"
        aria-invalid={errors.body ? true : undefined}
        className="min-h-16 leading-relaxed md:text-[13px]"
        {...form.register("body")}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
          event.preventDefault();
          void submit();
        }}
      />
      <div className="flex items-center justify-end gap-3">
        {message && (
          <p role="alert" className="mr-auto min-w-0 text-xs text-destructive">
            {message}
          </p>
        )}
        {length >= COUNTER_FROM && (
          <span
            className={cn(
              "text-xs tabular-nums",
              length > MAX_LENGTH ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {length.toLocaleString("en")}/{MAX_LENGTH.toLocaleString("en")}
          </span>
        )}
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={isSubmitting}
          title="Ctrl+Enter or ⌘+Enter"
          className="h-10 text-xs md:h-7"
        >
          {isSubmitting ? "Adding…" : "Add note"}
        </Button>
      </div>
    </form>
  );
}
