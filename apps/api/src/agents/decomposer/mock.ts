import type {
  AskClarificationInput,
  ClarificationAnswer,
  ProposeSubtasksInput,
  RelatedPayload,
  SkipInput,
} from "@postdog/shared";
import type { MockScript, MockTurn } from "../core/llm";
import { truncate } from "../core/trace";
import { GENERATE_ANYWAY } from "./prompt";

const STOPWORDS = new Set(["a", "an", "the", "to", "for", "of", "in", "on", "and", "add", "with"]);
const VAGUE_WORDS = new Set(["thing", "things", "stuff", "something", "misc", "etc"]);
const SINGLE_STEP_VERBS = new Set(["fix", "bump", "rename", "reindex", "revert", "restart"]);
export const MOCK_THRESHOLDS = { duplicates: 0.6, overlaps: 0.4 } as const;

function call(toolName: string, input: unknown): MockTurn {
  return { toolCalls: [{ toolName, input }] };
}

function unescape(text: string): string {
  return text.replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function keywords(title: string): Set<string> {
  return new Set(
    words(title)
      .filter((w) => !STOPWORDS.has(w))
      .map(stem),
  );
}

function similarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const shared = [...a].filter((w) => b.has(w)).length;
  return shared / (a.size + b.size - shared || 1);
}

interface BatchRow {
  id: number;
  title: string;
  keywords: Set<string>;
}

function readBatch(userMessage: string): BatchRow[] {
  const rows = /<batch>\n[^\n]*\n([\s\S]*?)\n?<\/batch>/.exec(userMessage)?.[1] ?? "";
  return [...rows.matchAll(/^(\d+) \| [^|]+ \| \w+ \| <task>(.*?)<\/task> \|/gm)].map((m) => {
    const title = unescape(m[2]!);
    return { id: Number(m[1]), title, keywords: keywords(title) };
  });
}

/** Pairs of batch tasks whose title keywords overlap enough, as duplicates or overlaps. */
export function similarPairs(rows: readonly BatchRow[]): RelatedPayload[] {
  const groups: RelatedPayload[] = [];
  rows.forEach((a, i) => {
    for (const b of rows.slice(i + 1)) {
      const score = similarity(a.keywords, b.keywords);
      if (score < MOCK_THRESHOLDS.overlaps) continue;
      const relation = score >= MOCK_THRESHOLDS.duplicates ? "duplicates" : "overlaps";
      const shared = [...a.keywords].filter((w) => b.keywords.has(w)).join(", ");
      groups.push({
        relation,
        taskIds: [a.id, b.id],
        reason: truncate(`Both titles are about ${shared}.`, 300),
      });
    }
  });
  return groups;
}

export const relatedMockScript: MockScript = ({ userMessage, turn }) => {
  const rows = readBatch(userMessage);
  const groups = similarPairs(rows).slice(0, 10);
  const first = groups[0];
  if (turn === 1 && first) {
    const a = rows.find((row) => row.id === first.taskIds[0])!;
    const b = rows.find((row) => row.id === first.taskIds[1])!;
    const query = [...a.keywords]
      .filter((w) => b.keywords.has(w))
      .slice(0, 2)
      .join(" ");
    return call("search_tasks", { query, status: "todo", limit: 10 });
  }
  return call("report_related", { groups });
};

interface TaskFacts {
  id: number;
  title: string;
  description: string;
  answers: ClarificationAnswer[];
  generateAnyway: boolean;
}

function readTask(userMessage: string): TaskFacts {
  const field = (name: string) =>
    unescape(new RegExp(`^${name}: <task>([\\s\\S]*?)</task>$`, "m").exec(userMessage)?.[1] ?? "");
  const answers = [...userMessage.matchAll(/^Q: (.*)\nA: <answer>([\s\S]*?)<\/answer>$/gm)].map(
    (m) => ({ question: m[1]!, answer: unescape(m[2]!) }),
  );
  return {
    id: Number(/^id: (\d+)$/m.exec(userMessage)?.[1]),
    title: field("title"),
    description: field("description").trim(),
    answers,
    generateAnyway: userMessage.includes(GENERATE_ANYWAY),
  };
}

function firstSentence(text: string): string {
  return /^[^.!?\n]*[.!?]?/.exec(text.trim())?.[0]?.trim() ?? "";
}

const title = (text: string) => truncate(text, 200);

function plannedSubtasks(task: TaskFacts): ProposeSubtasksInput["subtasks"] {
  const context = firstSentence(task.description);
  return [
    {
      title: title(`Plan: ${task.title}`),
      description: truncate(
        `Write down the approach and what is out of scope.${context ? `\n\nContext: ${context}` : ""}`,
        1500,
      ),
    },
    {
      title: title(`Build: ${task.title}`),
      description: truncate(task.description || "Make the change.", 1000),
      priority: "high",
    },
    {
      title: title(`Test and roll out: ${task.title}`),
      description: "Cover the change with tests, then ship it and check that it works.",
    },
  ];
}

function propose(task: TaskFacts): ProposeSubtasksInput {
  return {
    subtasks: plannedSubtasks(task),
    rationale: "Agree on the approach first, then build the change, then test and ship it.",
  };
}

function proposeFromAnswers(task: TaskFacts): ProposeSubtasksInput {
  const [plan, , test] = plannedSubtasks(task);
  const fromAnswers = task.answers.map(({ question, answer }) => ({
    title: title(answer.charAt(0).toUpperCase() + answer.slice(1)),
    description: `From the answer to "${question}"`,
  }));
  return {
    subtasks: [plan!, ...fromAnswers, test!],
    rationale: truncate(
      `Split using the user's answers: ${task.answers.map((a) => a.answer).join("; ")}`,
      1000,
    ),
  };
}

function proposeWithAssumptions(task: TaskFacts): ProposeSubtasksInput {
  return {
    subtasks: plannedSubtasks(task),
    rationale: truncate(
      `Generated without answers. Assumptions: the work is "${task.title}" as written; done means it is built, tested and shipped.`,
      1000,
    ),
  };
}

function askClarification(task: TaskFacts): AskClarificationInput {
  return {
    questions: [
      "What should be true when this task is done?",
      "Which part of the product does it cover, and what is out of scope?",
    ],
    whatIsUnclear: truncate(`"${task.title}" names no clear outcome or scope.`, 1000),
  };
}

function skipAtomic(task: TaskFacts): SkipInput {
  return {
    reason: "already_atomic",
    explanation: truncate(
      `"${task.title}" is one step of work; subtasks would only add overhead.`,
      300,
    ),
  };
}

export function isVague(taskTitle: string): boolean {
  const titleWords = words(taskTitle);
  return titleWords.length < 4 || titleWords.some((w) => VAGUE_WORDS.has(w));
}

export function isAtomic(taskTitle: string, description: string): boolean {
  return SINGLE_STEP_VERBS.has(words(taskTitle)[0] ?? "") || description.trim().length < 20;
}

export const taskMockScript: MockScript = ({ userMessage, turn }) => {
  const task = readTask(userMessage);
  if (task.generateAnyway) return call("propose_subtasks", proposeWithAssumptions(task));
  if (task.answers.length > 0) return call("propose_subtasks", proposeFromAnswers(task));
  if (isVague(task.title)) return call("ask_clarification", askClarification(task));
  if (isAtomic(task.title, task.description)) return call("skip", skipAtomic(task));
  if (turn === 1) return call("get_task", { id: task.id });
  return call("propose_subtasks", propose(task));
};
