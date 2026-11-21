"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { CreateTaskForm } from "./create-task-form";

export function CreateTaskButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} className="h-10 gap-1.5 px-3 text-[13px] md:h-8">
          <Plus className="size-4" aria-hidden />
          New task
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[15px]">New task</DialogTitle>
          <DialogDescription className="text-[13px]">
            Press Ctrl+Enter or ⌘+Enter to create it from any field.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <CreateTaskForm onCreated={() => setOpen(false)} onCancel={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
