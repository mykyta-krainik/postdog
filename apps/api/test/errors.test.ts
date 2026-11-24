import { apiErrorBodySchema, validationErrorDetailsSchema } from '@postdog/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { logger } from '../src/lib/logger';
import { createTask, createTestApi, jsonClient, type Api } from './helpers';
import { createTestDb } from './suggestionFixtures';

let api: Api;
beforeEach(() => {
  api = createTestApi();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function validationIssues(body: unknown) {
  const { error } = apiErrorBodySchema.parse(body);
  expect(error.code).toBe('validation_error');
  return validationErrorDetailsSchema.parse(error.details).issues;
}

describe('error responses', () => {
  it('reports every failing body field with its dotted path', async () => {
    const res = await api
      .post('/api/tasks')
      .send({ title: ' ', priority: 'urgent', status: 'blocked' })
      .expect(400);
    expect(
      validationIssues(res.body)
        .map((i) => i.path)
        .sort(),
    ).toEqual(['priority', 'status', 'title']);
  });

  it('uses array indexes in nested paths', async () => {
    const task = await createTask(api);
    const res = await api
      .post(`/api/tasks/${task.id}/subtasks`)
      .send({ subtasks: [{ title: 'ok' }, { title: '' }], baseUpdatedAt: task.updatedAt })
      .expect(400);
    expect(validationIssues(res.body).map((i) => i.path)).toEqual(['subtasks.1.title']);
  });

  it('rejects a bad path id and a bad query value', async () => {
    expect(validationIssues((await api.get('/api/tasks/abc').expect(400)).body)).toMatchObject([
      { path: 'id' },
    ]);
    const res = await api.get('/api/tasks?status=blocked&sort=title').expect(400);
    expect(
      validationIssues(res.body)
        .map((i) => i.path)
        .sort(),
    ).toEqual(['sort', 'status']);
  });

  it('rejects a missing body and malformed JSON as validation errors', async () => {
    await api.post('/api/tasks').expect(400);
    const res = await api
      .post('/api/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title": ')
      .expect(400);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('validation_error');
  });

  it('accepts twenty subtasks with full-length descriptions', async () => {
    const task = await createTask(api);
    const subtasks = Array.from({ length: 20 }, (_, i) => ({
      title: `Step ${i}`,
      description: 'd'.repeat(10_000),
    }));
    await api
      .post(`/api/tasks/${task.id}/subtasks`)
      .send({ subtasks, baseUpdatedAt: task.updatedAt })
      .expect(201);
  });

  it('hides what went wrong on the server behind a bare 500', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const db = createTestDb();
    const broken = jsonClient(createApp(db));
    db.$client.close();

    const res = await broken.get('/api/tasks').expect(500);
    expect(res.body).toEqual({
      error: { code: 'internal_error', message: 'Internal server error' },
    });
    expect(res.text).not.toMatch(/database|stack|\.ts:\d+/i);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('answers an unknown route with 404 not_found', async () => {
    const res = await api.get('/api/nope').expect(404);
    expect(apiErrorBodySchema.parse(res.body).error.code).toBe('not_found');
  });
});
