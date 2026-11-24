'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createNoteInputSchema, idSchema, type StatusUpdaterRun } from '@postdog/shared';
import { MessageSquareText } from 'lucide-react';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import {
  NOTE_MAX_LENGTH,
  notesInput,
  type NoteValues,
  type NotesRequest as NotesRequestOutput,
} from '../model/status-update';
import type { StatusUpdater } from '../model/use-status-update';

const noteBody = createNoteInputSchema.shape.body;

/** An empty box skips its task. A filled one follows the note rule. */
const notesFormSchema = z.object({
  notes: z.array(
    z.object({
      taskId: idSchema,
      body: z.string().refine((body) => body.trim() === '' || noteBody.safeParse(body).success, {
        message: `Keep notes under ${NOTE_MAX_LENGTH.toLocaleString('en')} characters.`,
      }),
    }),
  ),
});

const resolver = zodResolver(notesFormSchema);

/** ask_for_notes: one box per task. Saving sends the notes with the next run, which stores them. */
export function NotesRequest({
  run,
  output,
  updater,
}: {
  run: StatusUpdaterRun;
  output: NotesRequestOutput;
  updater: StatusUpdater;
}) {
  const id = useId();
  const form = useForm<NoteValues>({
    resolver,
    defaultValues: { notes: output.tasks.map((task) => ({ taskId: task.taskId, body: '' })) },
  });
  const { errors } = form.formState;

  const submit = form.handleSubmit((values) => {
    const next = notesInput(run.input, values);
    if (next) updater.run(next);
    else {
      form.setError('root', {
        message: 'Write a note for at least one task. Leave the others empty to skip them.',
      });
    }
  });

  const missing = errors.root?.message;

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex gap-2.5 rounded-md border border-brand/35 bg-brand-soft/60 px-3 py-2.5">
        <MessageSquareText className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[13px] font-medium">
            Not much moved here, so Postdog would rather ask than guess
          </p>
          <p className="text-[13px] text-muted-foreground">{output.question}</p>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {output.tasks.map((task, index) => {
          const fieldId = `${id}-${task.taskId}`;
          const error = errors.notes?.[index]?.body?.message;
          return (
            <li key={task.taskId} className="flex flex-col gap-1.5">
              <label htmlFor={fieldId} className="flex min-w-0 items-baseline gap-2 text-[13px]">
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {task.identifier}
                </span>{' '}
                <span className="min-w-0 truncate font-medium">{task.title}</span>
              </label>
              <Textarea
                id={fieldId}
                rows={2}
                placeholder="One line on where this stands, or leave it empty to skip"
                aria-invalid={error ? true : undefined}
                className="min-h-14 leading-relaxed md:text-[13px]"
                {...form.register(`notes.${index}.body`, {
                  onChange: () => form.clearErrors('root'),
                })}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </li>
          );
        })}
      </ul>

      {missing && (
        <p role="alert" className="text-xs text-destructive">
          {missing}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Each note is saved on its task, then Postdog writes the update.
        </p>
        <Button type="submit" size="sm" className="h-10 px-3 text-[13px] md:h-8">
          Save notes and write update
        </Button>
      </div>
    </form>
  );
}
