'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PRIORITIES, createTaskInputSchema, type CreateTaskInput } from '@postdog/shared';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';
import {
  PriorityIcon,
  StatusIcon,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  createTask,
  useTaskListParams,
  type CreateTaskValues,
} from '@/entities/task';
import { ApiError, getValidationIssues } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

const FIELDS = new Set<string>(Object.keys(createTaskInputSchema.shape));

function isField(path: string): path is FieldPath<CreateTaskValues> {
  return FIELDS.has(path);
}

/** Plain-language messages for the limits users hit. Any other issue keeps Zod's message. */
const MESSAGES: Record<string, Partial<Record<string, string>>> = {
  title: {
    too_small: 'Give the task a title.',
    too_big: 'Keep the title under 200 characters.',
  },
  description: { too_big: 'Keep the description under 10,000 characters.' },
};

const resolver = zodResolver(createTaskInputSchema, {
  error: (issue) => MESSAGES[String(issue.path?.[0])]?.[issue.code],
});

/** New tasks start in the status the list is filtered to, so they show up where the user looks. */
export function CreateTaskForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { params, setParams } = useTaskListParams();
  const form = useForm<CreateTaskValues, unknown, CreateTaskInput>({
    resolver,
    defaultValues: {
      title: '',
      description: '',
      status: params.status ?? 'todo',
      priority: 'medium',
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      const task = await createTask(values);
      toast.success(`Created ${task.identifier}`, {
        description: task.title,
        action: {
          label: 'Open',
          onClick: () => setParams({ selectedTaskId: task.id }, { history: 'push' }),
        },
      });
      onCreated();
    } catch (error) {
      let fieldErrors = 0;
      for (const issue of getValidationIssues(error)) {
        if (!isField(issue.path)) continue;
        form.setError(issue.path, { message: issue.message });
        fieldErrors += 1;
      }
      if (fieldErrors === 0) {
        form.setError('root', {
          message:
            error instanceof ApiError ? error.message : 'The task was not created. Try again.',
        });
      }
    }
  });

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit();
      }}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-title">Title</Label>
        <Input
          id="task-title"
          autoFocus
          autoComplete="off"
          placeholder="What needs doing?"
          aria-invalid={errors.title ? true : undefined}
          {...form.register('title')}
        />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-description">
          Description{' '}
          <span className="font-normal text-muted-foreground">(optional, markdown)</span>
        </Label>
        <Textarea
          id="task-description"
          rows={4}
          placeholder="Add context, links or acceptance criteria"
          aria-invalid={errors.description ? true : undefined}
          className="max-h-60"
          {...form.register('description')}
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-status">Status</Label>
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="task-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUS_ORDER.map((status) => (
                    <SelectItem key={status} value={status}>
                      <StatusIcon status={status} />
                      {TASK_STATUS_META[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-priority">Priority</Label>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="task-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.toReversed().map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      <PriorityIcon priority={priority} />
                      {TASK_PRIORITY_META[priority].shortLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      </div>

      {errors.root && (
        <p role="alert" className="text-[13px] text-destructive">
          {errors.root.message}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create task'}
        </Button>
      </div>
    </form>
  );
}
