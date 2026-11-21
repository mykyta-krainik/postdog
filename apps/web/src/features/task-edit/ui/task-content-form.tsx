"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { updateTask, type TaskDetail, type UpdateTaskInput } from "@/entities/task";
import { ApiError } from "@/shared/api";
import { errorMessage, setApiErrors } from "@/shared/lib/form-errors";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import {
  contentPatch,
  rebaseContent,
  taskContentSchema,
  type TaskContentValues,
} from "../model/content";

/** Plain-language messages for the limits users hit. Any other issue keeps Zod's message. */
const MESSAGES: Record<string, Partial<Record<string, string>>> = {
  title: {
    too_small: "Give the task a title.",
    too_big: "Keep the title under 200 characters.",
  },
  description: { too_big: "Keep the description under 10,000 characters." },
};

const resolver = zodResolver(taskContentSchema, {
  error: (issue) => MESSAGES[String(issue.path?.[0])]?.[issue.code],
});

const contentField = (path: string): FieldPath<TaskContentValues> | undefined =>
  path === "title" || path === "description" ? path : undefined;

const isEmpty = (patch: UpdateTaskInput) => Object.keys(patch).length === 0;

const SAVED_NOTICE_MS = 2000;

type SaveStatus = "idle" | "dirty" | "saving" | "failed" | "saved";

/** A failed save shows the API's own message instead. */
const SAVE_STATUS_TEXT: Record<Exclude<SaveStatus, "failed">, string> = {
  idle: "",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
};

/** Borderless until hovered or focused, so the panel reads as a document. */
const FIELD =
  "-mx-2 w-[calc(100%+1rem)] resize-none border-transparent bg-transparent px-2 shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent";

/** A save that failed after the form unmounted. The toast keeps the patch so the user can retry. */
function reportUnsaved(id: number, identifier: string, patch: UpdateTaskInput, error: unknown) {
  // The task was deleted, so there is nothing left to save.
  if (error instanceof ApiError && error.code === "not_found") return;
  toast.error(`Your edit to ${identifier} wasn't saved`, {
    description: errorMessage(error, "Something went wrong."),
    duration: Infinity,
    action: {
      label: "Retry",
      onClick: () =>
        void updateTask(id, patch).then(
          () => toast.success(`Saved ${identifier}`),
          (retryError: unknown) => reportUnsaved(id, identifier, patch, retryError),
        ),
    },
  });
}

type TaskContentFormProps = {
  task: Pick<TaskDetail, "id" | "identifier" | "title" | "description">;
  /** Rendered between the title and the description. */
  children?: ReactNode;
};

/**
 * The title and description of one task. A field saves when it loses focus, on Enter in the title,
 * and on Ctrl+Enter or ⌘+Enter in the description. A failed save keeps the text and shows why.
 * Render it with key={task.id}. An edit still unsaved when the form unmounts is saved then.
 */
export function TaskContentForm({ task, children }: TaskContentFormProps) {
  const form = useForm<TaskContentValues>({
    resolver,
    defaultValues: { title: task.title, description: task.description },
  });
  const { errors, isSubmitting } = form.formState;
  const [title, description] = useWatch({ control: form.control, name: ["title", "description"] });
  const dirty = !isEmpty(contentPatch({ title, description }, task));
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const status: SaveStatus = isSubmitting
    ? "saving"
    : dirty
      ? errors.root
        ? "failed"
        : "dirty"
      : savedAt !== null
        ? "saved"
        : "idle";

  // The content the API last confirmed. Saves diff against it, and server changes rebase onto it.
  const savedRef = useRef<TaskContentValues>({ title: task.title, description: task.description });
  const mounted = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const next = { title: task.title, description: task.description };
    const current = form.getValues();
    const rebased = rebaseContent(savedRef.current, next, current);
    savedRef.current = next;
    if (rebased.title !== current.title) form.setValue("title", rebased.title);
    if (rebased.description !== current.description) {
      form.setValue("description", rebased.description);
    }
  }, [form, task.title, task.description]);

  // Saves run one after another, so a later save never lands before an earlier one.
  const save = useCallback(() => {
    const run = form.handleSubmit(
      async (values) => {
        const patch = contentPatch(values, savedRef.current);
        if (isEmpty(patch)) return;
        try {
          const updated = await updateTask(task.id, patch);
          savedRef.current = { title: updated.title, description: updated.description };
          if (mounted.current) setSavedAt(Date.now());
        } catch (error) {
          if (!mounted.current) return reportUnsaved(task.id, task.identifier, patch, error);
          setApiErrors(form, error, contentField, "Your changes weren't saved. Try again.");
        }
      },
      (invalid) => {
        if (mounted.current) return;
        toast.error(`Your edit to ${task.identifier} wasn't saved`, {
          description: invalid.title?.message ?? invalid.description?.message,
        });
      },
    );
    queue.current = queue.current.then(() => run());
    return queue.current;
  }, [form, task.id, task.identifier]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void save();
    };
  }, [save]);

  // A reload or a closed tab skips the unmount save, so the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setSavedAt(null), SAVED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const titleField = form.register("title");
  const descriptionField = form.register("description");
  const saveOnBlur = (event: FocusEvent<HTMLTextAreaElement>) => {
    const field = event.currentTarget.name === "title" ? titleField : descriptionField;
    void field.onBlur(event);
    // Tabbing to Save or Discard must not save first.
    if (event.relatedTarget instanceof Node && statusRef.current?.contains(event.relatedTarget)) {
      return;
    }
    void save();
  };

  const discard = () => {
    form.reset(savedRef.current);
    setSavedAt(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Textarea
          aria-label="Title"
          rows={1}
          autoComplete="off"
          aria-invalid={errors.title ? true : undefined}
          className={cn(FIELD, "min-h-0 py-1 text-lg leading-snug font-semibold md:text-lg")}
          {...titleField}
          onBlur={saveOnBlur}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.currentTarget.blur();
          }}
        />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      {children}

      <div className="flex flex-col gap-1">
        <Textarea
          aria-label="Description, in markdown"
          placeholder="Add a description. Markdown works here."
          aria-invalid={errors.description ? true : undefined}
          className={cn(FIELD, "min-h-24 leading-relaxed md:text-[13px]")}
          {...descriptionField}
          onBlur={saveOnBlur}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
            event.preventDefault();
            void save();
          }}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
        <div ref={statusRef} className="flex items-center gap-2 text-xs">
          <span
            aria-live="polite"
            className={cn(
              "mr-auto flex min-w-0 items-center gap-1",
              status !== "idle" && "py-1.5",
              status === "failed" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {status === "saved" && <Check className="size-3.5" aria-hidden />}
            {status === "failed" ? errors.root?.message : SAVE_STATUS_TEXT[status]}
          </span>
          {(status === "dirty" || status === "failed") && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-10 text-xs md:h-7"
                // Keep focus in the field, so the blur does not save what is being discarded.
                onMouseDown={(event) => event.preventDefault()}
                onClick={discard}
              >
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-10 text-xs md:h-7"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void save()}
              >
                {status === "failed" ? "Try again" : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
