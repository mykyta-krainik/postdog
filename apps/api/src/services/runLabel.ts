import type { AgentName } from '@postdog/shared';
import type { Executor } from '../db/client';
import { findTask } from '../repositories/tasks';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const taskName = (ex: Executor, id: unknown) => {
  const task = typeof id === 'number' ? findTask(ex, id) : undefined;
  return task ? task.identifier : `task ${String(id)}`;
};

/** One line saying what a run was for, built from the input the run stored. */
export function runLabel(ex: Executor, agent: AgentName, input: unknown): string {
  const body = isRecord(input) ? input : {};
  switch (agent) {
    case 'planner':
      return 'Plan my day';
    case 'status_updater':
      return body.scope === 'task'
        ? `Status update for ${taskName(ex, body.taskId)}`
        : 'My status update';
    case 'decomposer': {
      if (body.suggestionId !== undefined) return 'Answer a clarification';
      const ids = Array.isArray(body.taskIds) ? body.taskIds : [];
      return ids.length > 0
        ? `Decompose ${ids.length} chosen ${ids.length === 1 ? 'task' : 'tasks'}`
        : 'Decompose to-do tasks';
    }
    case 'docs_reviewer':
      return 'Docs review';
  }
}
