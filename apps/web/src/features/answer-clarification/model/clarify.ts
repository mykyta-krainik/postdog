import type { ClarifyInput } from '@postdog/shared';
import { z } from 'zod';

/** clarifyInputSchema's bound on one answer. */
export const ANSWER_MAX = 1000;

/** One box per question, in the order of the questions. */
export const answersFormSchema = z.object({
  answers: z.array(
    z.object({
      answer: z
        .string()
        .trim()
        .min(1, 'Answer this one, or use Generate anyway.')
        .max(ANSWER_MAX, `Keep it under ${ANSWER_MAX.toLocaleString('en')} characters.`),
    }),
  ),
});
export type AnswerValues = z.input<typeof answersFormSchema>;

export function emptyAnswers(questions: readonly string[]): AnswerValues {
  return { answers: questions.map(() => ({ answer: '' })) };
}

/** Pairs each question with its trimmed answer for POST /agents/decomposer/clarify. */
export function answersInput(
  suggestionId: number,
  questions: readonly string[],
  values: AnswerValues,
): ClarifyInput {
  return {
    suggestionId,
    answers: questions.map((question, index) => ({
      question,
      answer: values.answers[index]?.answer.trim() ?? '',
    })),
  };
}

/** Asks the Decomposer to split the task anyway, assume what it must and list the assumptions. */
export function generateAnywayInput(suggestionId: number): ClarifyInput {
  return { suggestionId, generateAnyway: true };
}
