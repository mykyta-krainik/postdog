'use client';

import { agentRunSchema, type AgentRun, type StartRunResponse } from '@postdog/shared';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { aiRequest } from '@/shared/api';
import { errorMessage } from '@/shared/lib/form-errors';
import { isRunBusy, toRunView, type RunnerState, type RunView } from '../model/run-view';
import { cancelRun } from './mutations';
import { useAgentRun, type RunSchema } from './queries';

export type AgentRunner<Run extends AgentRun> = {
  view: RunView<Run>;
  /** Starts a run. Ignored while one is starting or running. Also the Retry action. */
  start: () => void;
  cancel: () => void;
  /** Back to idle, for example to hide a settled result. */
  reset: () => void;
};

/**
 * One AI action: start a run, poll it until it settles, cancel it, retry it.
 * `start` posts to an agent's run endpoint, such as startPlannerRun. `onSettled` runs once per
 * run when it completes, fails or is cancelled. The run id is component state, so each caller
 * tracks its own run.
 */
export function useAgentRunner<Schema extends RunSchema = typeof agentRunSchema>({
  start,
  schema,
  onSettled,
}: {
  start: () => Promise<StartRunResponse>;
  schema?: Schema;
  onSettled?: (run: z.output<Schema>) => void;
}): AgentRunner<z.output<Schema>> {
  const [state, setState] = useState<RunnerState>({ kind: 'idle' });
  const runId = state.kind === 'tracking' ? state.runId : undefined;
  const { data: run, error } = useAgentRun(runId, schema);
  const view = toRunView(state, run, error);

  const notifySettled = useEffectEvent((settled: z.output<Schema>) => onSettled?.(settled));
  const notifiedRunId = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!run || run.status === 'running' || notifiedRunId.current === run.id) return;
    notifiedRunId.current = run.id;
    notifySettled(run);
  }, [run]);

  return {
    view,
    start: () => {
      if (isRunBusy(view)) return;
      setState({ kind: 'starting' });
      aiRequest(start()).then(
        ({ runId: started }) => setState({ kind: 'tracking', runId: started }),
        (startError: unknown) => setState({ kind: 'start_failed', error: startError }),
      );
    },
    cancel: () => {
      if (runId === undefined) return;
      aiRequest(cancelRun(runId)).catch((cancelError: unknown) => {
        toast.error('The run is still going', {
          description: errorMessage(cancelError, "Cancel didn't reach the API. Try again."),
        });
      });
    },
    reset: () => setState({ kind: 'idle' }),
  };
}
