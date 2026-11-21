import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api";
import { setApiErrors } from "./form-errors";

function fakeForm() {
  const errors: Record<string, string | undefined> = {};
  return {
    errors,
    setError: (name: string, error: { message?: string }) => {
      errors[name] = error.message;
    },
  };
}

const validationError = (issues: { path: string; message: string }[]) =>
  new ApiError(400, "validation_error", "Invalid body", { issues });

describe("setApiErrors", () => {
  it("puts each validation issue on the field it names", () => {
    const form = fakeForm();
    setApiErrors(
      form,
      validationError([{ path: "subtasks.0.title", message: "Too long" }]),
      (path) => (path === "subtasks.0.title" ? "title" : undefined),
      "Not added.",
    );
    expect(form.errors).toEqual({ title: "Too long" });
  });

  it("shows the API message on the form when no issue names a field", () => {
    const form = fakeForm();
    setApiErrors(
      form,
      new ApiError(0, "network_error", "Postdog can't reach the API."),
      () => "title",
      "Not added.",
    );
    expect(form.errors).toEqual({ root: "Postdog can't reach the API." });
  });

  it("falls back to its own message for an error that is not from the API", () => {
    const form = fakeForm();
    setApiErrors(form, new TypeError("boom"), () => "title", "Not added. Try again.");
    expect(form.errors).toEqual({ root: "Not added. Try again." });
  });
});
