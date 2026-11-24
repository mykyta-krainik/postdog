import { settingsSchema } from "@postdog/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { seedDatabase } from "../src/db/seed";
import { getSetting, setSetting } from "../src/repositories/settings";
import { createTask, createTestApi, jsonClient, type Api } from "./helpers";
import { createTestDb } from "./suggestionFixtures";

let api: Api;
beforeEach(() => {
  api = createTestApi();
});

describe("settings", () => {
  it("returns the defaults when nothing is stored, without internal keys", async () => {
    await createTask(api);
    const res = await api.get("/api/settings").expect(200);
    expect(res.body).toEqual({
      aiEnabled: true,
      decompositionMode: "suggest",
      scheduledRunsEnabled: true,
    });
  });

  it("patches only the sent fields and persists them", async () => {
    let res = await api.patch("/api/settings").send({ aiEnabled: false }).expect(200);
    expect(settingsSchema.parse(res.body)).toEqual({
      aiEnabled: false,
      decompositionMode: "suggest",
      scheduledRunsEnabled: true,
    });
    res = await api.patch("/api/settings").send({ decompositionMode: "auto" }).expect(200);
    expect(res.body).toEqual({
      aiEnabled: false,
      decompositionMode: "auto",
      scheduledRunsEnabled: true,
    });
    res = await api.get("/api/settings").expect(200);
    expect(res.body).toEqual({
      aiEnabled: false,
      decompositionMode: "auto",
      scheduledRunsEnabled: true,
    });
  });

  it("turns the daily runs off and on again", async () => {
    let res = await api.patch("/api/settings").send({ scheduledRunsEnabled: false }).expect(200);
    expect(res.body).toEqual({
      aiEnabled: true,
      decompositionMode: "suggest",
      scheduledRunsEnabled: false,
    });
    expect((await api.get("/api/settings").expect(200)).body.scheduledRunsEnabled).toBe(false);

    res = await api.patch("/api/settings").send({ scheduledRunsEnabled: true }).expect(200);
    expect(res.body.scheduledRunsEnabled).toBe(true);
    expect((await api.get("/api/settings").expect(200)).body.scheduledRunsEnabled).toBe(true);
  });

  it("reads the daily runs as on in a database from before the setting, and hides the schedule's keys", async () => {
    const db = createTestDb();
    seedDatabase(db, Date.now());
    setSetting(db, "lastScheduledRun:planner", "2026-11-24");
    expect(getSetting(db, "scheduledRunsEnabled")).toBeUndefined();

    const res = await jsonClient(createApp(db)).get("/api/settings").expect(200);
    expect(res.body).toEqual({
      aiEnabled: true,
      decompositionMode: "suggest",
      scheduledRunsEnabled: true,
    });
  });

  it("rejects an unknown mode or a non-boolean switch with 400", async () => {
    let res = await api.patch("/api/settings").send({ decompositionMode: "yolo" }).expect(400);
    expect(res.body.error.details.issues[0].path).toBe("decompositionMode");
    res = await api.patch("/api/settings").send({ scheduledRunsEnabled: "no" }).expect(400);
    expect(res.body.error.details.issues[0].path).toBe("scheduledRunsEnabled");
    expect((await api.get("/api/settings")).body).toMatchObject({
      decompositionMode: "suggest",
      scheduledRunsEnabled: true,
    });
  });
});
