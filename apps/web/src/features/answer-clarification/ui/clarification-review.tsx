'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { Suggestion } from '@postdog/shared';
import { MessageCircleQuestionMark } from 'lucide-react';
import { useId } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import {
  ANSWER_MAX,
  answersFormSchema,
  answersInput,
  emptyAnswers,
  generateAnywayInput,
  type AnswerValues,
} from '../model/clarify';
import type { Clarifier } from '../model/use-clarify';

type ClarificationSuggestion = Extract<Suggestion, { kind: 'clarification' }>;

const resolver = zodResolver(answersFormSchema);
const ACTION = 'h-10 px-3 text-[13px] md:h-8';

function Counter({ length }: { length: number }) {
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        length > ANSWER_MAX ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {length}/{ANSWER_MAX.toLocaleString('en')}
    </span>
  );
}

/**
 * The Decomposer's questions about a task that is too vague to split: one box per question,
 * Send answers, or Generate anyway. Either starts a run through `clarifier`. Key it by suggestion.
 */
export function ClarificationReview({
  suggestion,
  clarifier,
}: {
  suggestion: ClarificationSuggestion;
  clarifier: Clarifier;
}) {
  const id = useId();
  const { questions, whatIsUnclear } = suggestion.payload;
  const form = useForm<AnswerValues>({
    resolver,
    mode: 'onTouched',
    defaultValues: emptyAnswers(questions),
  });
  const answers = useWatch({ control: form.control, name: 'answers' });
  const { errors } = form.formState;
  const disabled = clarifier.busy;

  const submit = form.handleSubmit((values) =>
    clarifier.send(answersInput(suggestion.id, questions, values)),
  );

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex gap-2.5 rounded-md border border-brand/35 bg-brand-soft/60 px-3 py-2.5">
        <MessageCircleQuestionMark className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-[13px] font-medium">Postdog would rather ask than guess</p>
          <p className="text-[13px] text-muted-foreground">{whatIsUnclear}</p>
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        {questions.map((question, index) => {
          const fieldId = `${id}-${index}`;
          const error = errors.answers?.[index]?.answer?.message;
          return (
            <li key={question} className="flex flex-col gap-1.5">
              <label htmlFor={fieldId} className="text-[13px] font-medium">
                {question}
              </label>
              <Textarea
                id={fieldId}
                rows={2}
                disabled={disabled}
                placeholder="Your answer"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${fieldId}-error` : undefined}
                className="min-h-14 leading-relaxed md:text-[13px]"
                {...form.register(`answers.${index}.answer`)}
              />
              <div className="flex items-start gap-2">
                <p id={`${fieldId}-error`} className="min-w-0 flex-1 text-xs text-destructive">
                  {error}
                </p>
                <Counter length={answers?.[index]?.answer.length ?? 0} />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Not sure? Generate anyway: Postdog will make reasonable assumptions and list them.
        </p>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`${ACTION} border-brand/40 hover:border-brand/70`}
            disabled={disabled}
            onClick={() => clarifier.send(generateAnywayInput(suggestion.id))}
          >
            Generate anyway
          </Button>
          <Button type="submit" size="sm" className={ACTION} disabled={disabled}>
            Send answers
          </Button>
        </div>
      </div>
    </form>
  );
}
