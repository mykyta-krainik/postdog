"use client";

import { TaskDetailPanel } from "@/widgets/task-detail-panel";
import { MEDIA } from "@/shared/config";
import { useMediaQuery } from "@/shared/lib/use-media-query";
import { Sheet, SheetContent, SheetTitle } from "@/shared/ui/sheet";

/**
 * Places the selected task by width. Desktop: a side panel next to the list.
 * Tablet: an overlay sheet from the right. Mobile: a full page that replaces the list.
 * The side panel and the full page are CSS, so they are right on the first paint.
 */
export function TaskDetailHost({
  taskId,
  onClose,
}: {
  taskId: number | undefined;
  onClose: () => void;
}) {
  const isTablet = useMediaQuery(MEDIA.tablet);

  return (
    <>
      {taskId !== undefined && !isTablet && (
        <aside
          aria-label="Selected task"
          className="flex min-h-0 w-full flex-col md:hidden lg:flex lg:w-[420px] lg:shrink-0 lg:border-l lg:border-border xl:w-[480px]"
        >
          <TaskDetailPanel taskId={taskId} onClose={onClose} />
        </aside>
      )}
      <Sheet open={isTablet && taskId !== undefined} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-[420px] gap-0 p-0 sm:max-w-[420px]"
        >
          <SheetTitle className="sr-only">Selected task</SheetTitle>
          {taskId !== undefined && <TaskDetailPanel taskId={taskId} onClose={onClose} />}
        </SheetContent>
      </Sheet>
    </>
  );
}
