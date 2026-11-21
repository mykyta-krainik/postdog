"use client";

import { AddNoteForm } from "@/features/add-task-note";
import { useTaskNotes, type TaskNote } from "@/entities/task";
import { formatDateTime } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { EmptyNote, PanelSection } from "./panel-section";

/** Oldest first, so the newest note sits right above the form that adds the next one. */
function NotesTimeline({ notes }: { notes: TaskNote[] }) {
  return (
    <ol className="flex flex-col gap-4 pl-5">
      {notes.map((note) => (
        <li
          key={note.id}
          className="relative flex flex-col gap-0.5 not-last:before:absolute not-last:before:top-4 not-last:before:-bottom-3 not-last:before:-left-[17px] not-last:before:w-px not-last:before:bg-border"
        >
          <span
            aria-hidden
            className="absolute top-[5px] -left-5 size-[7px] rounded-full border border-muted-foreground/70 bg-background"
          />
          <time
            dateTime={new Date(note.createdAt).toISOString()}
            className="text-xs text-muted-foreground tabular-nums"
          >
            {formatDateTime(note.createdAt)}
          </time>
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap wrap-anywhere">
            {note.body}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function NotesSection({ taskId }: { taskId: number }) {
  const { data, error, mutate } = useTaskNotes(taskId);
  const count = data?.items.length ?? 0;

  return (
    <PanelSection
      title="Notes"
      meta={
        count > 0 && <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      }
    >
      {data ? (
        count > 0 ? (
          <NotesTimeline notes={data.items} />
        ) : (
          <EmptyNote>No notes yet. Log progress, blockers and decisions here as you go.</EmptyNote>
        )
      ) : error ? (
        <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
          Notes didn&apos;t load.
          <Button variant="outline" size="sm" className="h-10 md:h-7" onClick={() => void mutate()}>
            Try again
          </Button>
        </div>
      ) : (
        <div aria-busy="true" aria-label="Loading notes" className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      )}
      <AddNoteForm taskId={taskId} />
    </PanelSection>
  );
}
