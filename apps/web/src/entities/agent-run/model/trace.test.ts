import type { TraceStep } from '@postdog/shared';
import { describe, expect, it } from 'vitest';
import { describeStep, progressText, summarizeTrace } from './trace';

let counter = 0;
function step(partial: Partial<TraceStep> & Pick<TraceStep, 'type'>): TraceStep {
  counter += 1;
  return { step: counter, input: '', outputSummary: '', durationMs: 10, ...partial };
}

const llm = () => step({ type: 'llm', tokens: { input: 900, output: 120 } });

describe('describeStep', () => {
  it('names the task a get_task step looked at by its identifier from the summary', () => {
    const looked = step({
      type: 'tool',
      tool: 'get_task',
      input: '{"id":12}',
      outputSummary: 'PD-12 Fix login, in_progress',
    });
    expect(describeStep(looked).done).toBe('Looked at PD-12');
  });

  it('falls back to the numeric id when the summary has no identifier', () => {
    const looked = step({
      type: 'tool',
      tool: 'get_task',
      input: '{"id":12}',
      outputSummary: 'not found',
    });
    expect(describeStep(looked).done).toBe('Looked at task 12');
  });

  it('quotes the search query, even from a truncated input', () => {
    const searched = step({
      type: 'tool',
      tool: 'search_tasks',
      input: '{"query":"auth","limit":10',
    });
    expect(describeStep(searched).done).toBe("Searched tasks for 'auth'");
  });

  it('counts the focus tasks of a submitted plan', () => {
    const input = JSON.stringify({
      focus: [1, 2, 3, 4].map((taskId) => ({ taskId, reason: 'r', signals: [] })),
    });
    expect(describeStep(step({ type: 'tool', tool: 'submit_daily_plan', input })).done).toBe(
      'Proposed 4 focus tasks',
    );
    const one = JSON.stringify({ focus: [{ taskId: 1, reason: 'r', signals: [] }] });
    expect(describeStep(step({ type: 'tool', tool: 'submit_daily_plan', input: one })).done).toBe(
      'Proposed 1 focus task',
    );
  });

  it("counts the subtasks and related groups of the Decomposer's terminal tools", () => {
    const proposed = JSON.stringify({
      subtasks: [{ title: 'A' }, { title: 'B' }, { title: 'C' }],
      rationale: 'r',
    });
    expect(
      describeStep(step({ type: 'tool', tool: 'propose_subtasks', input: proposed })).done,
    ).toBe('Proposed 3 subtasks');
    const groups = JSON.stringify({ groups: [{ relation: 'duplicates', taskIds: [1, 2] }] });
    expect(describeStep(step({ type: 'tool', tool: 'report_related', input: groups })).done).toBe(
      'Found 1 related group',
    );
    expect(
      describeStep(step({ type: 'tool', tool: 'report_related', input: '{"groups":[]}' })).done,
    ).toBe('Found no related tasks');
  });

  it('names an unknown tool instead of failing', () => {
    expect(describeStep(step({ type: 'tool', tool: 'search_docs', input: '{}' })).done).toBe(
      'Called search_docs',
    );
  });
});

describe('summarizeTrace', () => {
  it('joins the tool steps in order and leaves model calls out', () => {
    const trace = [
      llm(),
      step({
        type: 'tool',
        tool: 'get_task',
        input: '{"id":12}',
        outputSummary: 'PD-12 Fix login',
      }),
      llm(),
      step({ type: 'tool', tool: 'search_tasks', input: '{"query":"auth"}' }),
      llm(),
      step({
        type: 'tool',
        tool: 'submit_daily_plan',
        input: '{"focus":[{"taskId":1},{"taskId":2},{"taskId":3},{"taskId":4}]}',
      }),
      step({ type: 'validation', outputSummary: '4 of 4 focus items kept' }),
    ];
    expect(summarizeTrace(trace)).toBe(
      "Looked at PD-12, searched tasks for 'auth', proposed 4 focus tasks",
    );
  });

  it('is empty for a trace without tool steps', () => {
    expect(summarizeTrace([])).toBe('');
    expect(summarizeTrace([llm()])).toBe('');
  });
});

describe('progressText', () => {
  it('says the run is starting before the first step', () => {
    expect(progressText([])).toBe('Getting started…');
  });

  it('moves through the stages as the polled trace grows', () => {
    const trace: TraceStep[] = [llm()];
    expect(progressText(trace)).toBe('Thinking…');

    trace.push(
      step({ type: 'tool', tool: 'get_task', input: '{"id":7}', outputSummary: 'PD-7 Billing' }),
    );
    expect(progressText(trace)).toBe('Looking at PD-7…');

    trace.push(llm(), step({ type: 'tool', tool: 'search_tasks', input: '{"query":"invoice"}' }));
    expect(progressText(trace)).toBe("Searching tasks for 'invoice'…");

    trace.push(llm(), step({ type: 'tool', tool: 'submit_daily_plan', input: '{"focus":[' }));
    expect(progressText(trace)).toBe('Checking the plan…');

    trace.push(step({ type: 'validation' }));
    expect(progressText(trace)).toBe('Checking the result…');
  });
});
