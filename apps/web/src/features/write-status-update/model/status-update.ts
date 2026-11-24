import {
  createNoteInputSchema,
  type StatusUpdateTone,
  type StatusUpdaterInput,
  type StatusUpdaterOutput,
  type StatusUpdaterRun,
} from '@postdog/shared';
import type { RunView } from '@/entities/agent-run';

/** What an update covers: one task, or the user's tasks that changed in a window. */
export type StatusUpdateScope =
  { scope: 'task'; taskId: number } | { scope: 'since'; since?: number };

export type UpdateOutput = Extract<StatusUpdaterOutput, { kind: 'update' }>;
export type NotesRequest = Extract<StatusUpdaterOutput, { kind: 'needs_notes' }>;

/**
 * What the dialog shows. `run_state` covers starting, running, failed, cancelled and a request
 * that never produced a run: AgentRunStatus renders those. A completed run shows its output,
 * the draft update or the request for notes, and `empty` when it finished with neither.
 */
export type StatusUpdateView =
  | { kind: 'idle' }
  | { kind: 'run_state'; view: RunView<StatusUpdaterRun> }
  | { kind: 'update'; run: StatusUpdaterRun; output: UpdateOutput }
  | { kind: 'needs_notes'; run: StatusUpdaterRun; output: NotesRequest }
  | { kind: 'empty'; run: StatusUpdaterRun };

export function toStatusUpdateView(view: RunView<StatusUpdaterRun>): StatusUpdateView {
  if (view.status === 'idle') return { kind: 'idle' };
  if (view.status !== 'completed') return { kind: 'run_state', view };
  const { run } = view;
  switch (run.output?.kind) {
    case 'update':
      return { kind: 'update', run, output: run.output };
    case 'needs_notes':
      return { kind: 'needs_notes', run, output: run.output };
    case undefined:
      return { kind: 'empty', run };
  }
}

type Note = NonNullable<StatusUpdaterInput['notes']>[number];

function scopeOf(input: StatusUpdaterInput): StatusUpdateScope {
  if (input.scope === 'task') return { scope: 'task', taskId: input.taskId };
  return input.since === undefined ? { scope: 'since' } : { scope: 'since', since: input.since };
}

/** An input with only the fields that are set, so the request body carries no undefined keys. */
function build(
  scope: StatusUpdateScope,
  tone?: StatusUpdateTone,
  notes?: Note[],
): StatusUpdaterInput {
  return { ...scope, ...(tone && { tone }), ...(notes && { notes }) };
}

/** The first run of a scope: the model picks the tone, and a `since` scope uses the server's window. */
export function initialInput(scope: StatusUpdateScope): StatusUpdaterInput {
  return build(scope);
}

/**
 * Regenerate: the same scope with the tone the user chose. The tone is sent only when the user
 * picked another one than the run gave, or the run itself was asked for a tone. Notes are never
 * sent again, because the API already saved them as task notes.
 */
export function regenerateInput(
  previous: StatusUpdaterInput,
  chosenTone: StatusUpdateTone,
  runTone: StatusUpdateTone,
): StatusUpdaterInput {
  return build(scopeOf(previous), chosenTone !== runTone ? chosenTone : previous.tone);
}

/**
 * Retry: the same input. A run that exists has already saved its notes, so they are dropped;
 * when the request never produced a run, nothing was saved and the notes go again.
 */
export function retryInput(previous: StatusUpdaterInput, runExists: boolean): StatusUpdaterInput {
  return runExists ? build(scopeOf(previous), previous.tone) : previous;
}

export type NoteValues = { notes: { taskId: number; body: string }[] };

/**
 * Answering ask_for_notes: the same scope and tone, plus one note for each task the user wrote
 * one for. Empty boxes are skipped. Null when every box is empty.
 */
export function notesInput(
  previous: StatusUpdaterInput,
  values: NoteValues,
): StatusUpdaterInput | null {
  const notes = values.notes
    .map(({ taskId, body }) => ({ taskId, body: body.trim() }))
    .filter((note) => note.body !== '');
  if (notes.length === 0) return null;
  return build(scopeOf(previous), previous.tone, notes);
}

export const NOTE_MAX_LENGTH = createNoteInputSchema.shape.body.maxLength ?? 5000;

/** Whether Regenerate would throw away text the user typed. */
export function isDraftEdited(draft: string, generated: string): boolean {
  return draft !== generated;
}

export const TONE_META: Record<StatusUpdateTone, { label: string }> = {
  celebrate: { label: 'Celebrate' },
  neutral: { label: 'Neutral' },
  heads_up: { label: 'Heads up' },
  blocked: { label: 'Blocked' },
};
