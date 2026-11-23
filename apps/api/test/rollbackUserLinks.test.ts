import { rollbackResponseSchema } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import { findLink } from "../src/repositories/links";
import { findTask, listAllTasks } from "../src/repositories/tasks";
import { propose, setup } from "./agents/decomposerSetup";
import { waitForRun } from "./agents/helpers";
import { addTask } from "./suggestionFixtures";

describe("rolling back an auto run after the user linked one of its subtasks", () => {
  it("keeps the subtask and the user's link", async () => {
    const { db, api } = setup({ task: () => propose("Write the migration", "Add tests") });
    await api.patch("/api/settings").send({ decompositionMode: "auto" }).expect(200);
    const sso = addTask(db, { title: "Add SSO" });
    const release = addTask(db, { title: "Release 2.0" });
    const started = await api
      .post("/api/agents/decomposer/run")
      .send({ taskIds: [sso.id] })
      .expect(202);
    const run = await waitForRun(api, started.body.runId as number);
    const changesetId = (run.output as { changesetId: number }).changesetId;
    const [linked, untouched] = listAllTasks(db).filter((t) => t.parentId === sso.id);

    // Drawing a link does not bump the subtask's updatedAt.
    await api
      .post(`/api/tasks/${linked!.id}/links`)
      .send({ toTaskId: release.id, type: "blocks" })
      .expect(201);

    const res = await api.post(`/api/changesets/${changesetId}/rollback`).send({}).expect(200);
    const body = rollbackResponseSchema.parse(res.body);

    expect(findLink(db, linked!.id, release.id, "blocks")).toBeDefined();
    expect(findTask(db, linked!.id)).toBeDefined();
    expect(findTask(db, untouched!.id)).toBeUndefined();
    expect(body.kept.map((item) => [item.id, item.reason])).toEqual([[linked!.id, "has_links"]]);
    expect(body.message).toBe("Removed 1 subtask. 1 subtask had links and was kept.");
  });
});
