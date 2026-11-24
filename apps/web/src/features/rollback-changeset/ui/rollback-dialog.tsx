'use client';

import type { RollbackResponse } from '@postdog/shared';
import { CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import {
  keptItemText,
  rollbackChangeset,
  rollbackErrorMessage,
  type RollbackTarget,
} from '../model/rollback';

type Step =
  | { kind: 'confirm' }
  | { kind: 'working' }
  | { kind: 'done'; result: RollbackResponse }
  | { kind: 'failed'; message: string };

export const ROLLBACK_EXPLAINER =
  'Removes the untouched subtasks and links Postdog created. Anything you edited stays.';

const ACTION = 'max-md:h-10';

/**
 * Confirms a rollback, runs it, then shows the API's message and every item it kept, with why.
 * Mount it with a target to open it; `onClose` unmounts it. It cannot close while working.
 * `label` names the scope in the title, such as "PD-12" or "everything".
 */
export function RollbackDialog({
  target,
  label,
  onClose,
}: {
  target: RollbackTarget;
  label: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'confirm' });
  const working = step.kind === 'working';

  function run() {
    setStep({ kind: 'working' });
    rollbackChangeset(target).then(
      (result) => setStep({ kind: 'done', result }),
      (error: unknown) => setStep({ kind: 'failed', message: rollbackErrorMessage(error) }),
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !working && onClose()}>
      <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-md">
        {step.kind === 'done' ? (
          <RollbackResult result={step.result} onClose={onClose} />
        ) : (
          <>
            <DialogHeader className="gap-1.5 px-5 pt-5 text-left">
              <DialogTitle className="text-[15px] font-semibold">Roll back {label}?</DialogTitle>
              <DialogDescription className="text-[13px] leading-5">
                {ROLLBACK_EXPLAINER}
              </DialogDescription>
            </DialogHeader>
            {step.kind === 'failed' && (
              <p
                role="alert"
                className="mx-5 mt-3 flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] leading-5"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                {step.message}
              </p>
            )}
            <DialogFooter className="mt-5 border-t border-border px-5 py-3">
              <Button
                variant="outline"
                size="sm"
                className={ACTION}
                disabled={working}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className={ACTION}
                disabled={working}
                onClick={run}
              >
                {working && (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                )}
                {working ? 'Rolling back…' : step.kind === 'failed' ? 'Try again' : 'Roll back'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RollbackResult({ result, onClose }: { result: RollbackResponse; onClose: () => void }) {
  return (
    <>
      <DialogHeader className="gap-1.5 px-5 pt-5 text-left">
        <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold">
          <CircleCheck className="size-4 text-status-done" aria-hidden />
          Rolled back
        </DialogTitle>
        <DialogDescription role="status" className="text-[13px] leading-5 text-foreground">
          {result.message}
        </DialogDescription>
      </DialogHeader>
      {result.kept.length > 0 && (
        <div className="mx-5 mt-3 flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">Kept</p>
          <ul
            aria-label="Kept items"
            className="divide-y divide-border rounded-md border border-border"
          >
            {result.kept.map((item) => {
              const { name, reason } = keptItemText(item);
              return (
                <li
                  key={`${item.type}-${item.id}`}
                  className="flex flex-wrap gap-x-1.5 px-3 py-2 text-[13px]"
                >
                  <span className="min-w-0 wrap-anywhere">{name}</span>
                  <span className="text-muted-foreground">{reason}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <DialogFooter className="mt-5 border-t border-border px-5 py-3">
        <Button size="sm" className={ACTION} onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
