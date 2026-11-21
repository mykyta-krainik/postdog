import { describe, expect, it } from "vitest";
import { routes } from "@/shared/config";
import {
  DEFAULT_TASK_LIST_PARAMS,
  hasActiveFilters,
  parseTaskListParams,
  serializeTaskListParams,
  taskListHref,
  type TaskListParams,
} from "./list-params";

const parse = (search: string) => parseTaskListParams(new URLSearchParams(search));

describe("task list params", () => {
  it("reads defaults from an empty URL", () => {
    expect(parse("")).toEqual(DEFAULT_TASK_LIST_PARAMS);
  });

  it("reads every param", () => {
    expect(parse("status=in_progress&sort=priority&order=asc&q=login&task=12")).toEqual({
      status: "in_progress",
      sort: "priority",
      order: "asc",
      q: "login",
      selectedTaskId: 12,
    });
  });

  it("falls back to defaults for invalid values instead of failing", () => {
    expect(parse("status=blocked&sort=title&order=up&task=abc")).toEqual(DEFAULT_TASK_LIST_PARAMS);
    expect(parse("task=-3").selectedTaskId).toBeUndefined();
    expect(parse("task=1.5").selectedTaskId).toBeUndefined();
  });

  it("caps the search at the contract's 200 characters", () => {
    expect(parse(`q=${"a".repeat(300)}`).q).toHaveLength(200);
  });

  it("survives a round trip through the URL", () => {
    const params: TaskListParams = {
      status: "done",
      sort: "priority",
      order: "asc",
      q: "auth & login",
      selectedTaskId: 7,
    };
    expect(parse(serializeTaskListParams(params))).toEqual(params);
  });

  it("leaves defaults and blank searches out of the URL", () => {
    expect(serializeTaskListParams(DEFAULT_TASK_LIST_PARAMS)).toBe("");
    expect(serializeTaskListParams({ ...DEFAULT_TASK_LIST_PARAMS, q: "   " })).toBe("");
    expect(taskListHref({ ...DEFAULT_TASK_LIST_PARAMS, status: "todo" })).toBe(
      "/tasks?status=todo",
    );
  });

  it("selects the task that routes.task links to", () => {
    const url = new URL(routes.task(12), "http://localhost");
    expect(url.pathname).toBe(routes.tasks);
    expect(parseTaskListParams(url.searchParams).selectedTaskId).toBe(12);
  });

  it("counts a status filter or a search as active filters, not the sort", () => {
    expect(hasActiveFilters(parse("sort=priority&order=asc&task=3"))).toBe(false);
    expect(hasActiveFilters(parse("status=todo"))).toBe(true);
    expect(hasActiveFilters(parse("q=deploy"))).toBe(true);
  });
});
