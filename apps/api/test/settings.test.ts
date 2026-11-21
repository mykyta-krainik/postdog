import { settingsSchema } from "@postdog/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createTask, createTestApi, type Api } from "./helpers";

let api: Api;
beforeEach(() => {
  api = createTestApi();
});

describe("settings", () => {
  it("returns the defaults when nothing is stored, without internal keys", async () => {
    await createTask(api);
    const res = await api.get("/api/settings").expect(200);
    expect(res.body).toEqual({ aiEnabled: true, decompositionMode: "suggest" });
  });

  it("patches only the sent fields and persists them", async () => {
    let res = await api.patch("/api/settings").send({ aiEnabled: false }).expect(200);
    expect(settingsSchema.parse(res.body)).toEqual({
      aiEnabled: false,
      decompositionMode: "suggest",
    });
    res = await api.patch("/api/settings").send({ decompositionMode: "auto" }).expect(200);
    expect(res.body).toEqual({ aiEnabled: false, decompositionMode: "auto" });
    res = await api.get("/api/settings").expect(200);
    expect(res.body).toEqual({ aiEnabled: false, decompositionMode: "auto" });
  });

  it("rejects an unknown mode with 400", async () => {
    const res = await api.patch("/api/settings").send({ decompositionMode: "yolo" }).expect(400);
    expect(res.body.error.details.issues[0].path).toBe("decompositionMode");
    expect((await api.get("/api/settings")).body.decompositionMode).toBe("suggest");
  });
});
