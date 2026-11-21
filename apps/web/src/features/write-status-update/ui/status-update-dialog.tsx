"use client";

import type { ReactNode } from "react";
import { MockAiBadge } from "@/entities/agent-run";
import { MEDIA } from "@/shared/config";
import { useMediaQuery } from "@/shared/lib/use-media-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet";

/** A dialog from 768 px, a bottom sheet below, so the draft gets the full width of a phone. */
export function StatusUpdateDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  const isMobile = useMediaQuery(MEDIA.mobile);
  const badge = <MockAiBadge aiEnabled />;

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-xl pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-2 pr-8">
              <SheetTitle className="min-w-0 truncate text-[15px]">{title}</SheetTitle>
              {badge}
            </div>
            <SheetDescription className="text-[13px]">{description}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(88dvh,52rem)] gap-4 overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="min-w-0 truncate text-[15px]">{title}</DialogTitle>
            {badge}
          </div>
          <DialogDescription className="text-[13px]">{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
