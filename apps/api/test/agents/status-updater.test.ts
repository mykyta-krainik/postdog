import {
  apiErrorBodySchema,
  listNotesResponseSchema,
  statusUpdaterRunSchema,
  type StatusUpdaterRun,
  type TaskDetail,
} from '@postdog/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { agentRegistry } from '../../src/agents/registry';
import { createStatusUpdaterAgent } from '../../src/agents/status-updater';
import { IN_MEMORY, openDatabase } from '../../src/db/client';
import { migrateDatabase } from '../../src/db/migrate';
import { type Api, createTask, getTask, jsonClient, setNow } from '../helpers';
import { call, script, waitForRun, type Step } from './helpers';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 21, 12);

afterEach(() => {
  vi.useRealTimers();
});

function setup(steps?: Step[]) {
  const db = openDatabase(IN_MEMORY);
  migrateDatabase(db);
  const loop = steps && script(steps);
  const agents = loop
    ? { ...agentRegistry, status_updater: createStatusUpdaterAgent(loop.name) }
    : agentRegistry;
  return { api: jsonClient(createApp(db, { agents })), seen: loop?.seen ?? [] };
}

async function runUpdater(api: Api, body: object): Promise<StatusUpdaterRun> {
  const res = await api.post('/api/agents/status-updater/run').send(body).expect(202);
  expect(Object.keys(res.body)).toEqual(['runId']);
  return statusUpdaterRunSchema.parse(await waitForRun(api, res.body.runId));
}

function updateOf(run: StatusUpdaterRun) {
  if (run.output?.kind !== 'update') {
    throw new Error(`Expected an update, got ${JSON.stringify(run.error ?? run.output)}`);
  }
  return run.output;
}

function setStatus(api: Api, task: TaskDetail, status: TaskDetail['status']) {
  return api.patch(`/api/tasks/${task.id}`).send({ status }).expect(200);
}

function addNote(api: Api, task: TaskDetail, body: string) {
  return api.post(`/api/tasks/${task.id}/notes`).send({ body }).expect(201);
}

function submit(input: object): Step {
  return call('submit_status_update', {
    tone: 'neutral',
    toneReason: 'Facts',
    headline: 'Update',
    ...input,
  });
}

function tableIdentifiers(message: string): string[] {
  return [...message.matchAll(/^\d+ \| (PD-\d+) \| /gm)].map((match) => match[1]!);
}

describe('Status updater, task scope', () => {
  it('drafts an update from the task, its subtasks and notes, with Slack text built from the data', async () => {
    const { api } = setup();
    setNow(NOW - 5 * DAY);
    const parent = await createTask(api, { title: 'Add CSV export' });
    await setStatus(api, parent, 'in_progress');
    const endpoint = await createTask(api, {
      title: 'Streaming CSV endpoint',
      parentId: parent.id,
    });
    const button = await createTask(api, { title: 'Export button', parentId: parent.id });
    const other = await createTask(api, { title: 'Unrelated work' });

    setNow(NOW - 2 * HOUR);
    await setStatus(api, endpoint, 'done');
    await setStatus(api, other, 'done');
    await addNote(api, parent, 'The endpoint streams rows now.');

    setNow(NOW);
    const run = await runUpdater(api, { scope: 'task', taskId: parent.id });
    expect(run).toMatchObject({ status: 'completed', promptVersion: 'STATUS_UPDATER_PROMPT_V1' });
    const output = updateOf(run);
    expect(output.update.done).toEqual([
      { taskId: endpoint.id, identifier: endpoint.identifier, text: 'Streaming CSV endpoint' },
    ]);
    expect(output.update.inProgress.map((i) => i.taskId)).toEqual([parent.id]);
    expect(output.update.next).toEqual([button.title]);
    expect(output.warnings).toEqual([]);
    expect(output.text).toContain(`*Done:* ${endpoint.identifier} Streaming CSV endpoint`);
    expect(output.text).toContain(
      `*In progress:* ${parent.identifier} Add CSV export (1/2 subtasks done)`,
    );
    expect(output.text).not.toContain(other.identifier);
  });

  it('asks for notes when nothing happened, then drafts an update once the user adds one', async () => {
    const { api } = setup();
    setNow(NOW - 3 * DAY);
    const task = await createTask(api, { title: 'Upgrade the Postgres driver' });
    await setStatus(api, task, 'in_progress');
    const { updatedAt } = await getTask(api, task.id);

    setNow(NOW);
    const asked = await runUpdater(api, { scope: 'task', taskId: task.id });
    expect(asked.status).toBe('completed');
    expect(asked.output).toMatchObject({
      kind: 'needs_notes',
      tasks: [{ taskId: task.id, identifier: task.identifier, title: task.title }],
      question: expect.any(String),
    });

    setNow(NOW + HOUR);
    const body = 'Pool defaults checked, rollout tomorrow.';
    const run = await runUpdater(api, {
      scope: 'task',
      taskId: task.id,
      notes: [{ taskId: task.id, body }],
    });
    expect(updateOf(run).update.inProgress.map((i) => i.taskId)).toEqual([task.id]);
    expect(run.input).toMatchObject({ notes: [{ taskId: task.id, body }] });

    const notes = listNotesResponseSchema.parse(
      (await api.get(`/api/tasks/${task.id}/notes`).expect(200)).body,
    );
    expect(notes.items).toEqual([
      { id: expect.any(Number), taskId: task.id, body, createdAt: run.startedAt },
    ]);
    expect((await getTask(api, task.id)).updatedAt).toBe(updatedAt);
  });

  it('leads with stale work, asks for help and picks heads_up from the facts', async () => {
    const { api } = setup();
    setNow(NOW - 12 * DAY);
    const task = await createTask(api, { title: 'Migrate CI to GitHub Actions' });
    await setStatus(api, task, 'in_progress');

    setNow(NOW);
    const run = await runUpdater(api, {
      scope: 'task',
      taskId: task.id,
      notes: [{ taskId: task.id, body: 'Docker build still needs a registry.' }],
    });
    const { update, text } = updateOf(run);
    expect(update.tone).toBe('heads_up');
    expect(update.blockers).toEqual([
      expect.objectContaining({ taskId: task.id, ask: expect.any(String) }),
    ]);
    expect(text.split('\n')[0]).toMatch(/ :warning:$/);
    expect(text.split('\n')[1]).toMatch(
      new RegExp(
        `^\\*Blocker:\\* ${task.identifier} .*\\(in progress for 12 days\\)\\. \\*Ask:\\* `,
      ),
    );
  });

  it('drops items outside the scope and second items for a task, each with a warning', async () => {
    setNow(NOW - DAY / 2);
    const { api, seen } = setup([
      submit({
        blockers: [{ taskId: 1, text: 'Waiting on review', ask: 'Can Sam review today?' }],
        inProgress: [
          { taskId: 1, text: 'Same task again' },
          { taskId: 3, text: 'Not in scope' },
          { taskId: 999, text: 'Invented' },
        ],
      }),
    ]);
    const parent = await createTask(api, { title: 'Add SAML sign-on' });
    await createTask(api, { title: 'Metadata upload', parentId: parent.id });
    const other = await createTask(api, { title: 'Other work' });
    expect([parent.id, other.id]).toEqual([1, 3]);

    setNow(NOW);
    const output = updateOf(await runUpdater(api, { scope: 'task', taskId: parent.id }));
    expect(tableIdentifiers(seen[0]!.userMessage)).toEqual(['PD-1', 'PD-2']);
    expect(output.update.blockers.map((i) => i.taskId)).toEqual([parent.id]);
    expect(output.update.inProgress).toEqual([]);
    expect(output.warnings).toHaveLength(3);
    expect(output.warnings).toEqual(
      expect.arrayContaining([
        { taskId: parent.id, message: expect.stringContaining('PD-1') },
        { taskId: other.id, message: expect.stringContaining('PD-3') },
        { message: expect.stringContaining('999') },
      ]),
    );
  });

  it('answers 400 for an unknown task or notes on a task outside the scope, and stores nothing', async () => {
    const { api } = setup();
    const parent = await createTask(api, { title: 'Parent' });
    const other = await createTask(api, { title: 'Other' });
    const post = (body: object) =>
      api.post('/api/agents/status-updater/run').send(body).expect(400);
    const pathOf = (res: { body: unknown }) => {
      const { error } = apiErrorBodySchema.parse(res.body);
      expect(error.code).toBe('validation_error');
      return (error.details as { issues: { path: string }[] }).issues[0]!.path;
    };

    expect(pathOf(await post({ scope: 'task', taskId: 999 }))).toBe('taskId');
    expect(
      pathOf(await post({ scope: 'since', notes: [{ taskId: 999, body: 'Did things' }] })),
    ).toBe('notes.0.taskId');
    const outOfScope = await post({
      scope: 'task',
      taskId: parent.id,
      notes: [
        { taskId: parent.id, body: 'Fine' },
        { taskId: other.id, body: 'Not this one' },
      ],
    });
    expect(pathOf(outOfScope)).toBe('notes.1.taskId');

    expect((await api.get(`/api/tasks/${parent.id}/notes`)).body.items).toEqual([]);
    expect((await api.get('/api/agents/runs')).body.items).toEqual([]);
  });
});

describe('Status updater validation', () => {
  async function board(api: Api) {
    setNow(NOW - 3 * DAY);
    const unfinished = await createTask(api, { title: 'Rate limit the public API' });
    const finished = await createTask(api, { title: 'Fix flaky checkout test' });
    setNow(NOW - HOUR);
    await setStatus(api, unfinished, 'in_progress');
    await setStatus(api, finished, 'done');
    setNow(NOW);
    return { unfinished, finished };
  }

  it('cannot list an unfinished task as done: it moves to in progress with a warning', async () => {
    const { api } = setup([
      submit({
        tone: 'celebrate',
        done: [
          { taskId: 1, text: 'Shipped rate limiting' },
          { taskId: 2, text: 'Checkout test is green' },
        ],
      }),
    ]);
    const { unfinished, finished } = await board(api);

    const run = await runUpdater(api, { scope: 'since' });
    const output = updateOf(run);
    expect(output.update.done).toEqual([
      { taskId: finished.id, identifier: finished.identifier, text: 'Checkout test is green' },
    ]);
    expect(output.update.inProgress).toEqual([
      { taskId: unfinished.id, identifier: unfinished.identifier, text: 'Shipped rate limiting' },
    ]);
    expect(output.warnings).toEqual([
      { taskId: unfinished.id, message: expect.stringContaining(unfinished.identifier) },
    ]);
    expect(output.text).toContain(`*In progress:* ${unfinished.identifier} Shipped rate limiting`);
    expect(output.text).not.toContain(`*Done:* ${unfinished.identifier}`);
    expect(run.trace.filter((s) => s.type === 'validation').map((s) => s.outputSummary)).toContain(
      output.warnings[0]!.message,
    );
  });

  it('keeps the first item when a task is listed twice', async () => {
    const { api } = setup([
      submit({
        done: [{ taskId: 2, text: 'Checkout test is green' }],
        inProgress: [
          { taskId: 2, text: 'Still on checkout' },
          { taskId: 1, text: 'Rate limiting' },
        ],
      }),
    ]);
    const { unfinished, finished } = await board(api);
    const output = updateOf(await runUpdater(api, { scope: 'since' }));
    expect(output.update.done.map((i) => i.taskId)).toEqual([finished.id]);
    expect(output.update.inProgress.map((i) => i.taskId)).toEqual([unfinished.id]);
    expect(output.warnings).toEqual([{ taskId: finished.id, message: expect.any(String) }]);
  });

  it('fails with nothing_valid when no item survives validation', async () => {
    const { api } = setup([submit({ done: [{ taskId: 999, text: 'Invented work' }] })]);
    await board(api);
    const run = await runUpdater(api, { scope: 'since' });
    expect(run.status).toBe('failed');
    expect(run.error?.code).toBe('nothing_valid');
    expect(run.output).toBeNull();
  });

  it('uses the tone the user chose and says so to the model', async () => {
    const { api, seen } = setup([
      submit({ tone: 'celebrate', done: [{ taskId: 2, text: 'Green' }] }),
    ]);
    await board(api);
    const output = updateOf(await runUpdater(api, { scope: 'since', tone: 'heads_up' }));
    expect(seen[0]!.userMessage).toContain('the user chose "heads_up"');
    expect(output.update.tone).toBe('heads_up');
    expect(output.text.split('\n')[0]).toMatch(/ :warning:$/);
  });
});

describe('Status updater, since scope', () => {
  it('covers at most 15 tasks changed in the window, most recent first, and stores the resolved start', async () => {
    const { api, seen } = setup([submit({ inProgress: [{ taskId: 17, text: 'Moving' }] })]);
    setNow(NOW - 3 * DAY);
    const tasks: TaskDetail[] = [];
    for (let i = 0; i < 18; i++) tasks.push(await createTask(api, { title: `Task ${i + 1}` }));
    setNow(NOW - 2 * DAY);
    await setStatus(api, tasks[0]!, 'in_progress');
    for (let i = 1; i <= 16; i++) {
      setNow(NOW - (20 - i) * HOUR);
      await setStatus(api, tasks[i]!, 'in_progress');
    }
    setNow(NOW - HOUR / 2);
    await addNote(api, tasks[17]!, 'Only a note, no status change.');

    setNow(NOW);
    const run = await runUpdater(api, { scope: 'since' });
    expect(run.input).toEqual({ scope: 'since', since: NOW - DAY });
    expect(tableIdentifiers(seen[0]!.userMessage)).toEqual(
      [17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map((i) => tasks[i]!.identifier),
    );
    expect(seen[0]!.userMessage).toContain('15 most recently changed of the 17 tasks');
  });

  it('uses the start the user gave', async () => {
    const { api, seen } = setup([submit({ inProgress: [{ taskId: 2, text: 'Moving' }] })]);
    setNow(NOW - 3 * DAY);
    const older = await createTask(api, { title: 'Older change' });
    const recent = await createTask(api, { title: 'Recent change' });
    setNow(NOW - 6 * HOUR);
    await setStatus(api, older, 'in_progress');
    setNow(NOW - HOUR);
    await setStatus(api, recent, 'in_progress');

    setNow(NOW);
    const run = await runUpdater(api, { scope: 'since', since: NOW - 2 * HOUR });
    expect(run.input).toEqual({ scope: 'since', since: NOW - 2 * HOUR });
    expect(tableIdentifiers(seen[0]!.userMessage)).toEqual([recent.identifier]);
  });

  it('drafts an update with the mock model when tasks changed', async () => {
    const { api } = setup();
    setNow(NOW - 3 * DAY);
    const done = await createTask(api, { title: 'Fix flaky checkout test' });
    const moving = await createTask(api, { title: 'Add CSV export' });
    setNow(NOW - HOUR);
    await setStatus(api, done, 'done');
    await addNote(api, moving, 'Endpoint streams rows now.');
    setNow(NOW);
    const output = updateOf(await runUpdater(api, { scope: 'since' }));
    expect(output.update.done.map((i) => i.text)).toEqual(['Fix flaky checkout test']);
    expect(output.update.inProgress.map((i) => i.text)).toEqual(['Add CSV export']);
    expect(output.text.split('\n')).toHaveLength(3);
  });

  it('fails with nothing_valid without calling the model when nothing changed in the window', async () => {
    const { api } = setup();
    setNow(NOW - 3 * DAY);
    await createTask(api, { title: 'Old task' });
    setNow(NOW);
    const run = await runUpdater(api, { scope: 'since' });
    expect(run).toMatchObject({ status: 'failed', error: { code: 'nothing_valid' } });
    expect(run.trace.filter((s) => s.type === 'llm')).toEqual([]);
  });
});
