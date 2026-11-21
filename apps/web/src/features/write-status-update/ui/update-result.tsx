"use client";

import { STATUS_UPDATE_TONES, type StatusUpdateTone, type StatusUpdaterRun } from "@postdog/shared";
import {
  Check,
  Copy,
  Equal,
  OctagonX,
  PartyPopper,
  RotateCw,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { SuggestedBadge } from "@/entities/agent-run";
import { copyText } from "@/shared/lib/clipboard";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import {
  isDraftEdited,
  regenerateInput,
  TONE_META,
  type UpdateOutput,
} from "../model/status-update";
import type { StatusUpdater } from "../model/use-status-update";

const TONE_ICON: Record<StatusUpdateTone, LucideIcon> = {
  celebrate: PartyPopper,
  neutral: Equal,
  heads_up: TriangleAlert,
  blocked: OctagonX,
};

const ACTION = "h-10 gap-1.5 px-3 text-[13px] md:h-8";

function Warnings({ warnings }: { warnings: UpdateOutput["warnings"] }) {
  if (warnings.length === 0) return null;
  return (
    <div
      role="status"
      className="flex gap-2.5 rounded-md border border-brand/35 bg-brand-soft/60 px-3 py-2.5"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[13px] font-medium">
          Postdog checked the draft against your tasks and fixed{" "}
          {warnings.length === 1 ? "one thing" : `${warnings.length} things`}
        </p>
        <ul className="flex flex-col gap-0.5 text-[13px] text-muted-foreground">
          {warnings.map((warning, index) => (
            <li key={index} className="wrap-anywhere">
              {warning.message}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ToneHint({
  run,
  output,
  chosen,
}: {
  run: StatusUpdaterRun;
  output: UpdateOutput;
  chosen: StatusUpdateTone;
}) {
  const runTone = output.update.tone;
  if (chosen !== runTone) {
    return (
      <p className="text-xs text-foreground/80">
        Press Regenerate to rewrite it as {TONE_META[chosen].label.toLowerCase()}.
      </p>
    );
  }
  if (run.input.tone !== undefined) {
    return (
      <p className="text-xs text-muted-foreground">
        Written as {TONE_META[runTone].label.toLowerCase()}, the tone you picked.
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      <Sparkles className="mr-1 inline size-3 -translate-y-px text-brand" aria-hidden />
      Postdog picked {TONE_META[runTone].label.toLowerCase()}: {output.update.toneReason}
    </p>
  );
}

/**
 * The draft: the tone picker, the Slack text to edit, Regenerate and Copy. Key it by run, so a
 * new run starts from its own tone.
 */
export function UpdateResult({
  run,
  output,
  updater,
}: {
  run: StatusUpdaterRun;
  output: UpdateOutput;
  updater: StatusUpdater;
}) {
  const [tone, setTone] = useState<StatusUpdateTone>(output.update.tone);
  const [confirming, setConfirming] = useState(false);
  const textId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const draft = updater.draftFor(run.id, output.text);
  const edited = isDraftEdited(draft.text, output.text);

  const regenerate = () => {
    setConfirming(false);
    updater.run(regenerateInput(run.input, tone, output.update.tone));
  };

  const copy = async () => {
    const result = await copyText(draft.text);
    if (result === "manual") {
      textarea.current?.focus();
      textarea.current?.select();
      toast.message("Your browser blocked the clipboard", {
        description: "The update is selected. Press Ctrl+C or ⌘+C to copy it.",
      });
      return;
    }
    updater.markCopied(run.id, draft.text);
    toast.success("Copied. Paste it into Slack.");
  };

  return (
    <div className="flex flex-col gap-4">
      <Warnings warnings={output.warnings} />

      <div className="flex flex-col gap-2">
        <span id={`${textId}-tone`} className="text-[13px] font-medium">
          Tone
        </span>
        <ToggleGroup
          type="single"
          value={tone}
          onValueChange={(value) => {
            if (value) setTone(value as StatusUpdateTone);
          }}
          aria-labelledby={`${textId}-tone`}
          className="grid grid-cols-2 sm:grid-cols-4"
        >
          {STATUS_UPDATE_TONES.map((value) => {
            const Icon = TONE_ICON[value];
            return (
              <ToggleGroupItem
                key={value}
                value={value}
                className="h-10 text-[13px] font-normal md:h-8"
              >
                <Icon className="size-3.5" aria-hidden />
                {TONE_META[value].label}
                {value === output.update.tone && run.input.tone === undefined && (
                  <span className="sr-only"> (Postdog&apos;s pick)</span>
                )}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <ToneHint run={run} output={output} chosen={tone} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label htmlFor={textId} className="text-[13px] font-medium">
            Draft for Slack
          </label>
          {draft.copied ? (
            <Badge variant="outline" className="font-normal text-status-done">
              <Check aria-hidden />
              Copied
            </Badge>
          ) : (
            <SuggestedBadge />
          )}
          {edited && <span className="ml-auto text-xs text-muted-foreground">Edited</span>}
        </div>
        <Textarea
          id={textId}
          ref={textarea}
          value={draft.text}
          onChange={(event) => updater.editDraft(run.id, event.target.value)}
          spellCheck
          className="max-h-[50dvh] min-h-40 leading-relaxed md:text-[13px]"
        />
        <p className="text-xs text-muted-foreground">
          Slack formatting: *bold*, _italic_. Edit freely, Postdog only drafts it.
        </p>
      </div>

      {confirming ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 sm:flex-row sm:items-center"
        >
          <p className="min-w-0 flex-1 text-[13px]">Regenerating replaces your edits.</p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={ACTION}
              onClick={() => setConfirming(false)}
            >
              Keep editing
            </Button>
            <Button variant="outline" size="sm" className={ACTION} onClick={regenerate}>
              Replace my edits
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className={`${ACTION} border-brand/40 hover:border-brand/70`}
            onClick={() => (edited ? setConfirming(true) : regenerate())}
          >
            <RotateCw className="size-3.5 text-brand" aria-hidden />
            Regenerate
          </Button>
          <Button size="sm" className={ACTION} onClick={() => void copy()}>
            <Copy className="size-3.5" aria-hidden />
            Copy
          </Button>
        </div>
      )}
    </div>
  );
}
