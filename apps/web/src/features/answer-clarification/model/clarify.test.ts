import { clarifyInputSchema } from "@postdog/shared";
import { describe, expect, it } from "vitest";
import { answersFormSchema, answersInput, emptyAnswers, generateAnywayInput } from "./clarify";

const questions = ["Which endpoints need limits?", "Per user or per API key?"];

describe("answersInput", () => {
  it("pairs each question with its trimmed answer", () => {
    const input = answersInput(7, questions, {
      answers: [{ answer: "  Only /public/*  " }, { answer: "Per API key" }],
    });
    expect(input).toEqual({
      suggestionId: 7,
      answers: [
        { question: "Which endpoints need limits?", answer: "Only /public/*" },
        { question: "Per user or per API key?", answer: "Per API key" },
      ],
    });
    expect(clarifyInputSchema.safeParse(input).success).toBe(true);
  });
});

describe("generateAnywayInput", () => {
  it("sends generateAnyway without answers, as the contract requires", () => {
    const input = generateAnywayInput(7);
    expect(input).toEqual({ suggestionId: 7, generateAnyway: true });
    expect(clarifyInputSchema.safeParse(input).success).toBe(true);
  });
});

describe("answersFormSchema", () => {
  function errors(answers: string[]) {
    const parsed = answersFormSchema.safeParse({ answers: answers.map((answer) => ({ answer })) });
    return parsed.success ? [] : parsed.error.issues.map((issue) => [issue.path[1], issue.message]);
  }

  it("starts with one empty box per question", () => {
    expect(emptyAnswers(questions)).toEqual({ answers: [{ answer: "" }, { answer: "" }] });
  });

  it("requires every answer", () => {
    expect(errors(["Only /public/*", "   "])).toEqual([
      [1, "Answer this one, or use Generate anyway."],
    ]);
  });

  it("limits an answer to 1000 characters", () => {
    expect(errors(["x".repeat(1001), "ok"])).toEqual([[0, "Keep it under 1,000 characters."]]);
    expect(errors(["x".repeat(1000), "ok"])).toEqual([]);
  });
});
