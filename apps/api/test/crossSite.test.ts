import { apiErrorBodySchema } from '@postdog/shared';
import request, { type Response } from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { findChangeset, insertChangeset } from '../src/repositories/changesets';
import { findTask } from '../src/repositories/tasks';
import { addRun, addTask, createTestDb } from './suggestionFixtures';

/** An auto run that split a task into one subtask, behind the real app with no default headers. */
function setup() {
  const db = createTestDb();
  const parent = addTask(db, { title: 'Add SSO' });
  const sub = addTask(db, { title: 'Write the migration', parentId: parent.id });
  const changeset = insertChangeset(db, {
    runId: addRun(db),
    ops: [{ type: 'create_task', id: sub.id, taskId: parent.id }],
    now: Date.now(),
  });
  const rollbackUrl = `/api/changesets/${changeset.id}/rollback`;
  const untouched = () => {
    expect(findTask(db, sub.id)).toBeDefined();
    expect(findChangeset(db, changeset.id)?.status).toBe('applied');
  };
  return { db, api: request(createApp(db)), parent, sub, rollbackUrl, untouched };
}

const codeOf = (res: Response) => apiErrorBodySchema.parse(res.body).error.code;

describe('writes a page on another site could send', () => {
  it('answers a text/plain rollback with 415 and changes nothing', async () => {
    const { api, rollbackUrl, untouched } = setup();
    const res = await api
      .post(rollbackUrl)
      .set('Content-Type', 'text/plain')
      .send('{"taskId":1}')
      .expect(415);
    expect(codeOf(res)).toBe('unsupported_media_type');
    untouched();
  });

  it('answers a form post and a write without a body with 415', async () => {
    const { api, rollbackUrl, sub, untouched } = setup();
    const form = await api.post(rollbackUrl).type('form').send({ x: '1' }).expect(415);
    expect(codeOf(form)).toBe('unsupported_media_type');
    await api.post(rollbackUrl).expect(415);
    await api.delete(`/api/tasks/${sub.id}`).expect(415);
    untouched();
  });

  it('answers a JSON write marked cross-site with 403', async () => {
    const { api, rollbackUrl, untouched } = setup();
    const res = await api
      .post(rollbackUrl)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({})
      .expect(403);
    expect(codeOf(res)).toBe('forbidden');
    untouched();
  });
});

describe("the app's own JSON requests", () => {
  it('still roll back, delete and read', async () => {
    const { db, api, parent, sub, rollbackUrl } = setup();
    await api.post(rollbackUrl).set('Sec-Fetch-Site', 'same-origin').send({}).expect(200);
    expect(findTask(db, sub.id)).toBeUndefined();
    await api
      .delete(`/api/tasks/${parent.id}`)
      .set('Content-Type', 'application/json; charset=utf-8')
      .send({})
      .expect(204);
    await api.get(`/api/tasks/${parent.id}`).set('Sec-Fetch-Site', 'cross-site').expect(404);
  });
});
