import { listNotesResponseSchema, taskNoteSchema } from '@postdog/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask, createTestApi, setNow, type Api } from './helpers';

let api: Api;
beforeEach(() => {
  api = createTestApi();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('task notes', () => {
  it('adds a trimmed note with 201 and lists notes oldest first', async () => {
    const task = await createTask(api);
    setNow(2_000);
    const first = await api
      .post(`/api/tasks/${task.id}/notes`)
      .send({ body: '  Started on the API  ' })
      .expect(201);
    expect(taskNoteSchema.parse(first.body)).toEqual({
      id: 1,
      taskId: task.id,
      body: 'Started on the API',
      createdAt: 2_000,
    });
    setNow(3_000);
    await api.post(`/api/tasks/${task.id}/notes`).send({ body: 'Done with tests' }).expect(201);

    const res = await api.get(`/api/tasks/${task.id}/notes`).expect(200);
    expect(listNotesResponseSchema.parse(res.body).items.map((n) => n.body)).toEqual([
      'Started on the API',
      'Done with tests',
    ]);
  });

  it('keeps notes per task', async () => {
    const a = await createTask(api, { title: 'A' });
    const b = await createTask(api, { title: 'B' });
    await api.post(`/api/tasks/${a.id}/notes`).send({ body: 'For A' }).expect(201);
    const res = await api.get(`/api/tasks/${b.id}/notes`).expect(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('404s notes of an unknown task and 400s a blank body', async () => {
    await api.get('/api/tasks/999/notes').expect(404);
    await api.post('/api/tasks/999/notes').send({ body: 'x' }).expect(404);

    const task = await createTask(api);
    const res = await api.post(`/api/tasks/${task.id}/notes`).send({ body: '   ' }).expect(400);
    expect(res.body.error.details.issues[0].path).toBe('body');
  });
});
