'use client';

import type { ChangesetSummary } from '@postdog/shared';
import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import { RollbackDialog } from '@/features/rollback-changeset';
import { ChangesetTaskRow, canRollBackChangeset, canRollBackTask } from '@/entities/notification';
import { Button } from '@/shared/ui/button';

const ROLLBACK = 'h-10 gap-1.5 px-3 text-[13px] md:h-8';

type Scope = { taskId?: number; label: string };

/**
 * What an auto run created, task by task, with Roll back per task and for the whole changeset.
 * A part that was rolled back already has no button: what is left was kept on purpose.
 */
export function AutoDecompositionDetails({ changeset }: { changeset: ChangesetSummary }) {
  const [scope, setScope] = useState<Scope | null>(null);
  const canRollBackAll = canRollBackChangeset(changeset);

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label="Tasks this run changed" className="flex flex-col divide-y divide-border">
        {changeset.tasks.map((task) => (
          <ChangesetTaskRow
            key={task.taskId}
            task={task}
            action={
              canRollBackTask(task) && (
                <Button
                  variant="outline"
                  size="sm"
                  className={ROLLBACK}
                  disabled={scope !== null}
                  aria-label={`Roll back ${task.identifier ?? `task #${task.taskId}`}`}
                  onClick={() =>
                    setScope({ taskId: task.taskId, label: task.identifier ?? 'this task' })
                  }
                >
                  <Undo2 aria-hidden />
                  Roll back
                </Button>
              )
            }
          />
        ))}
      </ul>
      {changeset.tasks.length > 1 && canRollBackAll && (
        <Button
          variant="outline"
          size="sm"
          className={`${ROLLBACK} self-start`}
          disabled={scope !== null}
          onClick={() => setScope({ label: 'everything' })}
        >
          <Undo2 aria-hidden />
          Roll back everything
        </Button>
      )}
      {changeset.status === 'rolled_back' && (
        <p className="text-xs text-muted-foreground">Everything this run created was removed.</p>
      )}
      {scope && (
        <RollbackDialog
          target={{ changesetId: changeset.id, taskId: scope.taskId }}
          label={scope.label}
          onClose={() => setScope(null)}
        />
      )}
    </div>
  );
}
