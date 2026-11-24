'use client';

import { useEffect, useRef } from 'react';
import {
  revalidatePlannerLatest,
  revalidateRunLists,
  settledRunIds,
  useRunningRuns,
} from '@/entities/agent-run';
import { revalidateNotifications } from '@/entities/notification';
import { useSettings } from '@/entities/settings';
import { revalidateSuggestions } from '@/entities/suggestion';

/**
 * Keeps the app current while runs go on in the background. A run that leaves the running list
 * finished somewhere, maybe in a tab nobody watches, so everything a run can change refetches:
 * the plan, tasks and suggestions, the Inbox, and the run lists. A new run refetches the lists.
 */
export function RunsWatcher() {
  const { aiEnabled } = useSettings();
  const { runs } = useRunningRuns(aiEnabled);
  const ids = runs?.map((run) => run.id).join(',');
  const previous = useRef<number[] | undefined>(undefined);

  useEffect(() => {
    const current = ids ? ids.split(',').map(Number) : ids === '' ? [] : undefined;
    const before = previous.current;
    previous.current = current;
    if (before === undefined || current === undefined) return;
    if (settledRunIds(before, current).length > 0) {
      void revalidatePlannerLatest();
      void revalidateSuggestions();
      void revalidateNotifications();
      void revalidateRunLists();
    } else if (current.some((id) => !before.includes(id))) {
      void revalidateRunLists();
    }
  }, [ids]);

  return null;
}
