"use client";

import { Link2, ListTree } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

const AUTO_MAY = [
  { icon: ListTree, text: "Create subtasks under the tasks it splits" },
  { icon: Link2, text: "Add relates links between overlapping tasks" },
] as const;

/** Explains what Auto may change before the user turns it on. Closing it keeps Suggest. */
export function AutoModeDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-md">
        <DialogHeader className="gap-1.5 px-5 pt-5 text-left">
          <DialogTitle className="text-[15px] font-semibold">Switch to Auto?</DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            Auto creates subtasks and relates links right away. It may only:
          </DialogDescription>
        </DialogHeader>
        <ul className="mx-5 mt-3 divide-y divide-border rounded-md border border-border">
          {AUTO_MAY.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
              <Icon className="size-4 shrink-0 text-brand" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
        <p className="mx-5 mt-3 text-[13px] leading-5 text-muted-foreground">
          It never edits or deletes anything else. Every change can be undone from the Inbox. Its
          questions still wait for your answer.
        </p>
        <DialogFooter className="mt-5 border-t border-border px-5 py-3">
          <DialogClose asChild>
            <Button variant="outline" size="sm" className="max-md:h-10">
              Keep Suggest
            </Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={onConfirm}
            className="bg-brand text-brand-foreground hover:bg-brand/90 max-md:h-10"
          >
            Switch to Auto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
