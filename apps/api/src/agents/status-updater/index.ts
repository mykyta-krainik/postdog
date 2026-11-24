import {
  askForNotesInputSchema,
  statusUpdaterInputSchema,
  statusUpdaterOutputSchema,
  submitStatusUpdateInputSchema,
  type StatusUpdaterInput,
  type StatusUpdaterOutput,
} from '@postdog/shared';
import type { Db } from '../../db/client';
import { invalidField } from '../../lib/errors';
import { insertNote } from '../../repositories/notes';
import { findTask } from '../../repositories/tasks';
import { defineAgent } from '../core/definition';
import { AgentError } from '../core/errors';
import { registerMockScript } from '../core/llm';
import { runAgent } from '../core/runAgent';
import { defineTerminalTool } from '../core/tool';
import { createReadTools } from '../tools/read';
import { statusUpdaterMockScript } from './mock';
import { checkNotesRequest, checkUpdate, renderSlackText, type Finding } from './output';
import {
  buildUserMessage,
  formatTime,
  STATUS_UPDATER_PROMPT_V1,
  STATUS_UPDATER_PROMPT_VERSION,
} from './prompt';
import { loadStatusScope, windowStartOf } from './scope';

export const STATUS_UPDATER_LOOP = 'status_updater';

registerMockScript(STATUS_UPDATER_LOOP, statusUpdaterMockScript);

const submitStatusUpdate = defineTerminalTool({
  name: 'submit_status_update',
  description: [
    'Submit the finished status update. Call it once, when the table or the notes show progress to report.',
    'Do not use it when no task in scope has a note, a status change or a subtask change in the window; call ask_for_notes instead.',
    'Example: {"tone": "neutral", "toneReason": "Work is moving and nothing is blocked", "headline": "CSV export is halfway", "done": [{"taskId": 19, "text": "Streaming endpoint shipped"}], "inProgress": [{"taskId": 15, "text": "Export button is next"}], "blockers": [], "next": ["Wire up the download state"]}.',
  ].join(' '),
  input: submitStatusUpdateInputSchema,
});

const askForNotes = defineTerminalTool({
  name: 'ask_for_notes',
  description: [
    'Ask the user for a one-line note on tasks with nothing to report, instead of inventing progress.',
    'Use it when no task in scope has a note, a status change or a subtask change in the window.',
    'Do not use it when there is progress to report; call submit_status_update instead.',
    'Example: {"taskIds": [7], "question": "What happened on this since yesterday? One line is enough."}.',
  ].join(' '),
  input: askForNotesInputSchema,
});

function prepare(db: Db, input: StatusUpdaterInput, startedAt: number): StatusUpdaterInput {
  return db.transaction((tx) => {
    let prepared = input;
    if (input.scope === 'task') {
      if (!findTask(tx, input.taskId)) {
        throw invalidField('taskId', `Task ${input.taskId} does not exist`);
      }
    } else {
      if (input.since !== undefined && input.since > startedAt) {
        throw invalidField('since', 'since must not be in the future');
      }
      prepared = { ...input, since: windowStartOf(input, startedAt) };
    }

    input.notes?.forEach((note, i) => {
      const path = `notes.${i}.taskId`;
      const task = findTask(tx, note.taskId);
      if (!task) throw invalidField(path, `Task ${note.taskId} does not exist`);
      if (input.scope === 'task' && task.id !== input.taskId && task.parentId !== input.taskId) {
        throw invalidField(
          path,
          `${task.identifier} is not in this update's scope: use the task or one of its subtasks`,
        );
      }
      insertNote(tx, { taskId: task.id, body: note.body, createdAt: startedAt });
    });
    return prepared;
  });
}

export function createStatusUpdaterAgent(loopName = STATUS_UPDATER_LOOP) {
  return defineAgent({
    name: 'status_updater',
    promptVersion: STATUS_UPDATER_PROMPT_VERSION,
    input: statusUpdaterInputSchema,
    output: statusUpdaterOutputSchema,
    prepare,
    run: async (ctx, input): Promise<{ output: StatusUpdaterOutput }> => {
      const scope = loadStatusScope(ctx.db, input, ctx.startedAt);
      if (scope.rows.length === 0) {
        throw new AgentError(
          'nothing_valid',
          input.scope === 'task'
            ? `Task ${input.taskId} no longer exists.`
            : `No task changed since ${formatTime(scope.windowStart)}. Add a note to a task or pick an earlier start.`,
        );
      }

      const read = createReadTools(ctx.db, () => ctx.startedAt);
      const result = await runAgent({
        ...ctx,
        name: loopName,
        system: STATUS_UPDATER_PROMPT_V1,
        userMessage: buildUserMessage(scope, input.scope === 'task', input.tone),
        tools: [read.getTask, read.getTaskNotes, read.searchTasks, submitStatusUpdate, askForNotes],
      });

      const record = (findings: Finding[], summary: string) => {
        for (const { item, warning } of findings) {
          ctx.trace.record({
            type: 'validation',
            input: item,
            outputSummary: warning.message,
            durationMs: 0,
          });
        }
        ctx.trace.record({ type: 'validation', input: '', outputSummary: summary, durationMs: 0 });
      };

      if (result.toolName === 'ask_for_notes') {
        const { tasks, findings } = checkNotesRequest(result.output, scope);
        if (tasks.length === 0) {
          record(findings, 'No task left to ask about');
          throw new AgentError(
            'nothing_valid',
            "The agent asked for notes only on tasks outside this update's scope.",
          );
        }
        record(findings, `Asking for notes on ${tasks.map((t) => t.identifier).join(', ')}`);
        return { output: { kind: 'needs_notes', tasks, question: result.output.question } };
      }

      const tone = input.tone ?? result.output.tone;
      const { update, findings } = checkUpdate({ ...result.output, tone }, scope);
      const kept = update.done.length + update.inProgress.length + update.blockers.length;
      if (kept === 0) {
        record(findings, 'No item left after validation');
        throw new AgentError(
          'nothing_valid',
          `Every item in the update failed validation: ${findings.map((f) => f.warning.message).join('; ')}`,
        );
      }
      const overridden =
        tone !== result.output.tone ? `; used the tone the user chose (${tone})` : '';
      record(
        findings,
        `Kept ${kept} ${kept === 1 ? 'item' : 'items'} with ${findings.length} ${findings.length === 1 ? 'warning' : 'warnings'}${overridden}`,
      );
      return {
        output: {
          kind: 'update',
          update,
          warnings: findings.map((f) => f.warning),
          text: renderSlackText(update, scope.rows),
        },
      };
    },
  });
}

export const statusUpdaterAgent = createStatusUpdaterAgent();
