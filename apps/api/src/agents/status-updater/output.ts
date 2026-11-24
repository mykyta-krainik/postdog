import type {
  AgentWarning,
  AskForNotesInput,
  StatusUpdate,
  StatusUpdateTone,
  StatusUpdaterOutput,
  SubmitStatusUpdateInput,
  TaskStatus,
} from '@postdog/shared';
import { escapeMarkup } from './prompt';
import type { StatusRow, StatusScope } from './scope';

export interface Finding {
  item: unknown;
  warning: AgentWarning;
}

interface Item {
  taskId: number;
}

type NeedsNotes = Extract<StatusUpdaterOutput, { kind: 'needs_notes' }>;

function statusLabel(status: TaskStatus): string {
  return status === 'in_progress' ? 'in progress' : status;
}

function outOfScope(scope: StatusScope, taskId: number, item: unknown): Finding {
  const identifier = scope.identifiers.get(taskId);
  return {
    item,
    warning: identifier
      ? { taskId, message: `Dropped ${identifier}: it is not in this update's scope` }
      : { message: `Dropped an item for task ${taskId}: no task has this id` },
  };
}

export function checkUpdate(
  submitted: SubmitStatusUpdateInput,
  scope: StatusScope,
): { update: StatusUpdate; findings: Finding[] } {
  const rows = new Map(scope.rows.map((row) => [row.id, row]));
  const findings: Finding[] = [];
  const listed = new Set<number>();

  const inScope = <T extends Item>(items: readonly T[]): T[] =>
    items.filter((item) => {
      if (rows.has(item.taskId)) return true;
      findings.push(outOfScope(scope, item.taskId, item));
      return false;
    });

  const once = <T extends Item>(items: readonly T[]): T[] =>
    items.filter((item) => {
      if (!listed.has(item.taskId)) {
        listed.add(item.taskId);
        return true;
      }
      const { identifier } = rows.get(item.taskId)!;
      findings.push({
        item,
        warning: {
          taskId: item.taskId,
          message: `Dropped a second item for ${identifier}: each task is listed once`,
        },
      });
      return false;
    });

  const withIdentifier = <T extends Item>(item: T) => ({
    ...item,
    identifier: rows.get(item.taskId)!.identifier,
  });

  const blockers = once(inScope(submitted.blockers));
  const done: SubmitStatusUpdateInput['done'] = [];
  const moved: SubmitStatusUpdateInput['done'] = [];
  for (const item of inScope(submitted.done)) {
    const row = rows.get(item.taskId)!;
    if (row.status === 'done') {
      done.push(item);
      continue;
    }
    moved.push(item);
    findings.push({
      item,
      warning: {
        taskId: item.taskId,
        message: `Moved ${row.identifier} from done to in progress: its status is ${statusLabel(row.status)}`,
      },
    });
  }
  const keptDone = once(done);
  const inProgress = once([...inScope(submitted.inProgress), ...moved]);

  return {
    update: {
      tone: submitted.tone,
      toneReason: submitted.toneReason,
      headline: submitted.headline,
      done: keptDone.map(withIdentifier),
      inProgress: inProgress.map(withIdentifier),
      blockers: blockers.map(withIdentifier),
      next: submitted.next,
    },
    findings,
  };
}

export function checkNotesRequest(
  submitted: AskForNotesInput,
  scope: StatusScope,
): { tasks: NeedsNotes['tasks']; findings: Finding[] } {
  const rows = new Map(scope.rows.map((row) => [row.id, row]));
  const findings: Finding[] = [];
  const tasks: NeedsNotes['tasks'] = [];
  for (const taskId of new Set(submitted.taskIds)) {
    const row = rows.get(taskId);
    if (row) tasks.push({ taskId, identifier: row.identifier, title: row.title });
    else findings.push(outOfScope(scope, taskId, { taskId }));
  }
  return { tasks, findings };
}

export type RenderFacts = Pick<
  StatusRow,
  'id' | 'status' | 'subtaskDone' | 'subtaskTotal' | 'daysInStatus' | 'isStale' | 'openBlockers'
>;

interface RenderItem {
  taskId: number;
  identifier: string;
  text: string;
  ask?: string;
}

const TONE_EMOJI: Record<StatusUpdateTone, string> = {
  celebrate: ' :tada:',
  neutral: '',
  heads_up: ' :warning:',
  blocked: ' :rotating_light:',
};

function factsOf(row: RenderFacts | undefined): string {
  if (!row || row.status === 'done') return '';
  const facts = [
    row.status === 'todo' ? 'not started' : null,
    row.subtaskTotal > 0 ? `${row.subtaskDone}/${row.subtaskTotal} subtasks done` : null,
    row.openBlockers.length > 0
      ? `blocked by ${row.openBlockers.map((t) => t.identifier).join(', ')}`
      : null,
    row.isStale ? `in progress for ${row.daysInStatus} days` : null,
  ].filter((fact) => fact !== null);
  return facts.length > 0 ? ` (${facts.join(', ')})` : '';
}

function itemLine(label: string, item: RenderItem, row: RenderFacts | undefined): string {
  const text = escapeMarkup(item.text.replace(/[\s.]+$/, ''));
  const ask = item.ask ? `. *Ask:* ${escapeMarkup(item.ask)}` : '';
  return `*${label}:* ${item.identifier} ${text}${factsOf(row)}${ask}`;
}

export function renderSlackText(update: StatusUpdate, facts: readonly RenderFacts[]): string {
  const byId = new Map(facts.map((row) => [row.id, row]));
  const lines = (label: string, items: readonly RenderItem[]) =>
    items.map((item) => itemLine(label, item, byId.get(item.taskId)));
  return [
    `*${escapeMarkup(update.headline)}*${TONE_EMOJI[update.tone]}`,
    ...lines('Blocker', update.blockers),
    ...lines('Done', update.done),
    ...lines('In progress', update.inProgress),
    ...(update.next.length > 0 ? [`*Next:* ${update.next.map(escapeMarkup).join('; ')}`] : []),
  ].join('\n');
}
