'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { parseTaskListParams, taskListHref, type TaskListParams } from './list-params';

export type SetTaskListParams = (
  patch: Partial<TaskListParams>,
  options?: { history?: 'push' | 'replace' },
) => void;

/**
 * The Tasks page state from the URL. hrefWith builds links for rendering.
 * setParams reads the URL at call time, so a late debounced call cannot undo a newer change.
 */
export function useTaskListParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useMemo(() => parseTaskListParams(searchParams), [searchParams]);

  const hrefWith = useCallback(
    (patch: Partial<TaskListParams>) => taskListHref({ ...params, ...patch }),
    [params],
  );

  const setParams = useCallback<SetTaskListParams>(
    (patch, { history = 'replace' } = {}) => {
      const current = parseTaskListParams(new URLSearchParams(window.location.search));
      const href = taskListHref({ ...current, ...patch });
      if (history === 'push') router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [router],
  );

  return { params, hrefWith, setParams };
}
