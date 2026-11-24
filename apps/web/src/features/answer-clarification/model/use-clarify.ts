'use client';

import { decomposerRunSchema, type ClarifyInput, type DecomposerRun } from '@postdog/shared';
import { useRef } from 'react';
import { isRunBusy, startClarifyRun, useAgentRunner, type AgentRunner } from '@/entities/agent-run';
import { revalidateNotifications } from '@/entities/notification';
import { revalidateSuggestions } from '@/entities/suggestion';

export type Clarifier = AgentRunner<DecomposerRun> & {
  /** Starts a run with the answers, or with generateAnyway. Ignored while one is going. */
  send: (input: ClarifyInput) => void;
  busy: boolean;
};

/**
 * The re-run that answers a clarification. Hold it above the clarification card: the run
 * supersedes that suggestion, so the card goes away while the run's result still shows.
 * The task list and detail refetch when the run starts, so the task shows it is processing,
 * and again when it settles, so a new suggestion appears. In auto mode the result is applied, so
 * the Inbox badge refetches too.
 */
export function useClarify(): Clarifier {
  const input = useRef<ClarifyInput | undefined>(undefined);
  const runner = useAgentRunner({
    start: async () => {
      if (!input.current) throw new Error('Nothing to send yet.');
      const started = await startClarifyRun(input.current);
      void revalidateSuggestions();
      return started;
    },
    schema: decomposerRunSchema,
    onSettled: () => {
      void revalidateSuggestions();
      void revalidateNotifications();
    },
  });
  const busy = isRunBusy(runner.view);

  return {
    ...runner,
    busy,
    send: (next) => {
      if (busy) return;
      input.current = next;
      runner.start();
    },
  };
}
