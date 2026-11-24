'use client';

import { useEffect, useRef } from 'react';
import { SuggestionReview } from '@/widgets/suggestion-review';
import { TaskDetailPanel } from '@/widgets/task-detail-panel';
import type { TaskDetail } from '@/entities/task';
import { MEDIA } from '@/shared/config';
import { useMediaQuery } from '@/shared/lib/use-media-query';
import { Sheet, SheetContent, SheetTitle } from '@/shared/ui/sheet';

/**
 * Places the selected task by width. Desktop: a side panel next to the list.
 * Tablet: an overlay sheet from the right. Mobile: a full page that replaces the list.
 * The side panel and the full page are CSS, so they are right on the first paint.
 */
const suggestions = (task: TaskDetail) => <SuggestionReview key={task.id} task={task} />;

/** Moves focus back to the list row of a task whose detail closed. */
function focusTaskRow(taskId: number | undefined) {
  if (taskId === undefined) return;
  document.querySelector<HTMLElement>(`a[data-task-id="${taskId}"]`)?.focus();
}

export function TaskDetailHost({
  taskId,
  onClose,
}: {
  taskId: number | undefined;
  onClose: () => void;
}) {
  const isTablet = useMediaQuery(MEDIA.tablet);
  // The task whose detail is open, so focus can return to its row once it closes.
  const shown = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (taskId !== undefined) {
      shown.current = taskId;
      return;
    }
    // The sheet returns focus itself, after its exit animation.
    if (isTablet) return;
    const lost = document.activeElement === null || document.activeElement === document.body;
    if (lost) focusTaskRow(shown.current);
    shown.current = undefined;
  }, [taskId, isTablet]);

  return (
    <>
      {taskId !== undefined && !isTablet && (
        <aside
          aria-label="Selected task"
          className="flex min-h-0 w-full flex-col md:hidden lg:flex lg:w-[420px] lg:shrink-0 lg:border-l lg:border-border xl:w-[480px]"
        >
          <TaskDetailPanel taskId={taskId} onClose={onClose} suggestions={suggestions} />
        </aside>
      )}
      <Sheet open={isTablet && taskId !== undefined} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focusTaskRow(shown.current);
            shown.current = undefined;
          }}
          className="w-[420px] gap-0 p-0 sm:max-w-[420px]"
        >
          <SheetTitle className="sr-only">Selected task</SheetTitle>
          {taskId !== undefined && (
            <TaskDetailPanel taskId={taskId} onClose={onClose} suggestions={suggestions} />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
