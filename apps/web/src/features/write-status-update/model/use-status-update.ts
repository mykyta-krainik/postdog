"use client";

import { statusUpdaterRunSchema, type StatusUpdaterInput } from "@postdog/shared";
import { useRef, useState } from "react";
import { mutate } from "swr";
import { startAgentRun, useAgentRunner } from "@/entities/agent-run";
import { taskKeys } from "@/entities/task";
import {
  initialInput,
  retryInput,
  toStatusUpdateView,
  type StatusUpdateScope,
  type StatusUpdateView,
} from "./status-update";

/** The user's edits to one run's draft. It lives here, so closing the dialog keeps them. */
type Draft = { runId: number; text: string; copied: boolean };

export type StatusUpdater = {
  view: StatusUpdateView;
  /** Starts the first run of the scope. Does nothing once a run exists, so reopening shows it. */
  begin: () => void;
  /** Starts a run with this input: Regenerate and the answer to ask_for_notes. */
  run: (input: StatusUpdaterInput) => void;
  retry: () => void;
  cancel: () => void;
  draftFor: (runId: number, generated: string) => { text: string; copied: boolean };
  editDraft: (runId: number, text: string) => void;
  markCopied: (runId: number, text: string) => void;
};

/**
 * One status update conversation for a scope: the run, Regenerate with another tone, the
 * answer to a request for notes, and the user's edits to the draft.
 */
export function useStatusUpdate(scope: StatusUpdateScope): StatusUpdater {
  // The input of the latest start. A ref, so start() always posts what run() just set.
  const input = useRef<StatusUpdaterInput>(initialInput(scope));
  const runner = useAgentRunner({
    start: () => startAgentRun("status_updater", input.current),
    schema: statusUpdaterRunSchema,
    onSettled: (settled) => {
      // The API saved these as task notes, so their timelines are out of date.
      for (const note of settled.input.notes ?? []) void mutate(taskKeys.notes(note.taskId));
    },
  });
  const [draft, setDraft] = useState<Draft | undefined>(undefined);

  const run = (next: StatusUpdaterInput) => {
    input.current = next;
    runner.start();
  };

  return {
    view: toStatusUpdateView(runner.view),
    begin: () => {
      if (runner.view.status === "idle") run(initialInput(scope));
    },
    run,
    retry: () => run(retryInput(input.current, runner.view.status !== "request_failed")),
    cancel: runner.cancel,
    draftFor: (runId, generated) =>
      draft?.runId === runId ? draft : { text: generated, copied: false },
    editDraft: (runId, text) =>
      setDraft((current) => ({
        runId,
        text,
        copied: current?.runId === runId ? current.copied : false,
      })),
    markCopied: (runId, text) => setDraft({ runId, text, copied: true }),
  };
}
