"use client";

import { PRIORITIES, type Priority, type Suggestion } from "@postdog/shared";
import { X } from "lucide-react";
import { useId, useReducer, useState } from "react";
import { PriorityIcon, TASK_PRIORITY_META, type TaskDetail } from "@/entities/task";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import {
  MIN_SUBTASKS_MESSAGE,
  checkDraft,
  draftReducer,
  editedPayload,
  initialDraft,
  type DraftAction,
  type DraftItem,
  type ItemErrors,
} from "../model/subtasks-draft";
import { useReview } from "../model/use-review";
import { ReviewActions } from "./review-actions";

type SubtasksSuggestion = Extract<Suggestion, { kind: "subtasks" }>;

function PriorityPicker({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: Priority;
  disabled: boolean;
  onChange: (value: Priority) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`${label}: ${TASK_PRIORITY_META[value].label}`}
          title={TASK_PRIORITY_META[value].label}
          className="size-10 shrink-0 md:size-8"
        >
          <PriorityIcon priority={value} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as Priority)}>
          {PRIORITIES.toReversed().map((priority) => (
            <DropdownMenuRadioItem key={priority} value={priority} className="gap-2 text-[13px]">
              <PriorityIcon priority={priority} />
              {TASK_PRIORITY_META[priority].shortLabel}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DraftRow({
  item,
  position,
  errors,
  disabled,
  dispatch,
}: {
  item: DraftItem;
  position: number;
  errors: ItemErrors | undefined;
  disabled: boolean;
  dispatch: (action: DraftAction) => void;
}) {
  const id = useId();
  const name = `Subtask ${position}`;
  return (
    <li className="flex flex-col gap-1.5 rounded-md border border-border bg-background/60 p-2">
      <div className="flex items-center gap-1">
        <span className="w-5 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
          {position}
        </span>
        <Input
          value={item.title}
          disabled={disabled}
          aria-label={`${name} title`}
          aria-invalid={errors?.title ? true : undefined}
          aria-describedby={errors?.title ? `${id}-title` : undefined}
          onChange={(event) =>
            dispatch({ type: "edit", key: item.key, field: "title", value: event.target.value })
          }
          className="h-10 min-w-0 flex-1 border-transparent bg-transparent px-2 text-[13px] shadow-none hover:border-input md:h-8 md:text-[13px] dark:bg-transparent"
        />
        <PriorityPicker
          label={`${name} priority`}
          value={item.priority ?? "medium"}
          disabled={disabled}
          onChange={(value) => dispatch({ type: "priority", key: item.key, value })}
        />
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Remove ${name.toLowerCase()}`}
          title="Remove"
          onClick={() => dispatch({ type: "remove", key: item.key })}
          className="size-10 shrink-0 text-muted-foreground md:size-8"
        >
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      {errors?.title && (
        <p id={`${id}-title`} className="pl-7 text-xs text-destructive">
          {errors.title}
        </p>
      )}
      <Textarea
        value={item.description}
        disabled={disabled}
        rows={2}
        aria-label={`${name} description`}
        placeholder="What done looks like (optional)"
        aria-invalid={errors?.description ? true : undefined}
        onChange={(event) =>
          dispatch({
            type: "edit",
            key: item.key,
            field: "description",
            value: event.target.value,
          })
        }
        className="ml-6 min-h-10 w-auto border-transparent bg-transparent px-2 py-1.5 text-xs leading-relaxed text-muted-foreground shadow-none hover:border-input focus-visible:text-foreground md:text-xs dark:bg-transparent"
      />
      {errors?.description && <p className="pl-7 text-xs text-destructive">{errors.description}</p>}
    </li>
  );
}

/**
 * A proposed split: the rationale, then each subtask to edit (title, description, priority) or
 * remove. Accept sends the edited payload only when something changed. Key it by suggestion.
 */
export function SubtasksReview({
  suggestion,
  task,
}: {
  suggestion: SubtasksSuggestion;
  task: Pick<TaskDetail, "identifier" | "updatedAt">;
}) {
  const [draft, dispatch] = useReducer(draftReducer, suggestion.payload, initialDraft);
  // The task as the user loaded it. Reload after a 409 stale moves it to the task as it is now.
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(task.updatedAt);
  const review = useReview(suggestion.id, task.identifier);
  const check = checkDraft(draft, suggestion.payload.rationale);
  const listError = draft.removeBlocked ? MIN_SUBTASKS_MESSAGE : !check.ok ? check.list : undefined;
  const count = draft.items.length;

  const accept = () => {
    if (!check.ok) return;
    review.accept(
      { payload: editedPayload(suggestion.payload, check.payload), baseUpdatedAt },
      `Added ${count} subtasks to ${task.identifier}`,
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        {suggestion.payload.rationale}
      </p>
      <ol aria-label="Suggested subtasks" className="flex flex-col gap-1.5">
        {draft.items.map((item, index) => (
          <DraftRow
            key={item.key}
            item={item}
            position={index + 1}
            errors={check.ok ? undefined : check.items[item.key]}
            disabled={review.saving}
            dispatch={dispatch}
          />
        ))}
      </ol>
      {listError && (
        <p role="alert" className="text-xs text-destructive">
          {listError}
        </p>
      )}
      <ReviewActions
        review={review}
        acceptLabel={`Add ${count} subtasks`}
        acceptDisabled={!check.ok}
        onAccept={accept}
        onReload={() => setBaseUpdatedAt(task.updatedAt)}
        hint="Edit or remove any of them first. Nothing changes until you accept."
      />
    </div>
  );
}
