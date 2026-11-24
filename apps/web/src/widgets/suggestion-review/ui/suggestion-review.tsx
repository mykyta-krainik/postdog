'use client';

import { Link2, ListTree, MessageCircleQuestionMark, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import {
  ClarificationReview,
  ClarifyRun,
  useClarify,
  type Clarifier,
} from '@/features/answer-clarification';
import { RelatedReview, SubtasksReview } from '@/features/review-suggestion';
import { SuggestedBadge } from '@/entities/agent-run';
import { useSettings } from '@/entities/settings';
import { describeSuggestion, type Suggestion } from '@/entities/suggestion';
import type { TaskDetail } from '@/entities/task';

const KIND_ICON: Record<Suggestion['kind'], LucideIcon> = {
  subtasks: ListTree,
  clarification: MessageCircleQuestionMark,
  related: Link2,
};

function SuggestionBody({
  suggestion,
  task,
  clarifier,
}: {
  suggestion: Suggestion;
  task: TaskDetail;
  clarifier: Clarifier;
}) {
  switch (suggestion.kind) {
    case 'subtasks':
      return <SubtasksReview suggestion={suggestion} task={task} />;
    case 'clarification':
      return <ClarificationReview suggestion={suggestion} clarifier={clarifier} />;
    case 'related':
      return <RelatedReview suggestion={suggestion} task={task} />;
  }
}

function SuggestionCard({
  suggestion,
  task,
  clarifier,
}: {
  suggestion: Suggestion;
  task: TaskDetail;
  clarifier: Clarifier;
}) {
  const id = useId();
  const Icon = KIND_ICON[suggestion.kind];
  return (
    <article
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-brand/30 bg-brand-soft/25 p-3"
    >
      <header className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-brand" aria-hidden />
        <h4 id={id} className="min-w-0 flex-1 truncate text-[13px] font-medium">
          {describeSuggestion(suggestion)}
        </h4>
        <SuggestedBadge />
      </header>
      <SuggestionBody suggestion={suggestion} task={task} clarifier={clarifier} />
    </article>
  );
}

/**
 * The pending suggestions of one task, each reviewed by its kind, and the run that answers a
 * clarification. Key it by task. Hidden while AI is off, and when there is nothing to show.
 */
export function SuggestionReview({ task }: { task: TaskDetail }) {
  const headingId = useId();
  const { aiEnabled } = useSettings();
  const clarifier = useClarify();
  const suggestions = task.pendingSuggestions;

  if (!aiEnabled) return null;
  if (suggestions.length === 0 && clarifier.view.status === 'idle') return null;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2.5 border-t border-border pt-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={headingId} className="text-[13px] font-medium text-foreground">
          Suggestions
        </h3>
        {suggestions.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {suggestions.length} to review
          </span>
        )}
      </div>
      <ClarifyRun clarifier={clarifier} />
      {suggestions.map((suggestion) => (
        <SuggestionCard
          key={suggestion.id}
          suggestion={suggestion}
          task={task}
          clarifier={clarifier}
        />
      ))}
    </section>
  );
}
