import {
  STALE_IN_PROGRESS_DAYS,
  STATUS_UPDATE_TONES,
  type AskForNotesInput,
  type StatusUpdateTone,
  type SubmitStatusUpdateInput,
} from "@postdog/shared";
import type { MockScript, MockTurn } from "../core/llm";
import { EDITED, NO_ACTIVITY, TABLE_COLUMNS } from "./prompt";

interface TableRow {
  id: number;
  identifier: string;
  parent: string;
  status: string;
  daysInStatus: number;
  stale: boolean;
  blockers: string;
  progress: boolean;
  title: string;
}

const TEXT_MAX = 200;

function unescape(text: string): string {
  return text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function cut(text: string): string {
  return text.length <= TEXT_MAX ? text : `${text.slice(0, TEXT_MAX - 1)}…`;
}

function parseTable(message: string): TableRow[] {
  const lines = message.split("\n");
  const start = lines.indexOf(TABLE_COLUMNS.join(" | ")) + 1;
  if (start === 0) return [];
  const end = lines.indexOf("", start);
  return lines.slice(start, end === -1 ? undefined : end).map((line) => {
    const values = line.split(" | ");
    const cell = (column: (typeof TABLE_COLUMNS)[number]) => {
      const i = TABLE_COLUMNS.indexOf(column);
      return column === "title" ? values.slice(i).join(" | ") : values[i]!;
    };
    const window = cell("in the window").split(", ");
    return {
      id: Number(cell("id")),
      identifier: cell("identifier"),
      parent: cell("parent"),
      status: cell("status"),
      daysInStatus: Number(cell("days in status")),
      stale: cell("stale") === "yes",
      blockers: cell("open blockers"),
      progress: window.some((part) => part !== NO_ACTIVITY && part !== EDITED),
      title: unescape(
        cell("title")
          .replace(/^<task>/, "")
          .replace(/<\/task>$/, ""),
      ),
    };
  });
}

function chosenTone(message: string): StatusUpdateTone | undefined {
  const match = /^Tone: the user chose "([a-z_]+)"/m.exec(message);
  return STATUS_UPDATE_TONES.find((tone) => tone === match?.[1]);
}

function call(toolName: string, input: unknown): MockTurn {
  return { toolCalls: [{ toolName, input }] };
}

function askForNotes(rows: readonly TableRow[]): AskForNotesInput {
  const identifiers = new Set(rows.map((row) => row.identifier));
  const tops = rows.filter((row) => !identifiers.has(row.parent));
  return {
    taskIds: tops.slice(0, 10).map((row) => row.id),
    question:
      "Nothing changed on these in the window. What happened since then? One line each is enough.",
  };
}

function draftUpdate(
  rows: readonly TableRow[],
  tone: StatusUpdateTone | undefined,
  openSubtasks: string[],
): SubmitStatusUpdateInput {
  const open = rows.filter((row) => row.status !== "done");
  const blocked = open.filter((row) => row.blockers !== "none");
  const stale = open.filter((row) => row.stale && !blocked.includes(row));
  const done = rows.filter((row) => row.progress && row.status === "done");
  const moving = open.filter(
    (row) => row.progress && !blocked.includes(row) && !stale.includes(row),
  );
  const items = blocked.length + stale.length + done.length + moving.length;

  let factTone: StatusUpdateTone;
  let toneReason: string;
  let headline: string;
  if (blocked.length > 0) {
    factTone = "blocked";
    toneReason = `${blocked[0]!.identifier} is waiting on ${blocked[0]!.blockers}.`;
    headline = `${blocked[0]!.identifier} is blocked and needs a hand`;
  } else if (stale.length > 0) {
    factTone = "heads_up";
    toneReason = `${stale.map((row) => row.identifier).join(", ")} in progress for more than ${STALE_IN_PROGRESS_DAYS} days.`;
    headline = `${stale[0]!.identifier} has been in progress for ${stale[0]!.daysInStatus} days`;
  } else if (done.length * 2 > items) {
    factTone = "celebrate";
    toneReason = `${done.length} of ${items} tasks in this update are done.`;
    headline = `${done.length} of ${items} done, nearly there`;
  } else {
    factTone = "neutral";
    toneReason = "Work is moving and nothing is blocked or stale.";
    headline = "Steady progress, nothing blocked";
  }

  const item = (row: TableRow) => ({ taskId: row.id, text: cut(row.title) });
  return {
    tone: tone ?? factTone,
    toneReason,
    headline,
    done: done.map(item),
    inProgress: moving.map(item),
    blockers: [
      ...blocked.map((row) => ({
        ...item(row),
        ask: cut(`Can someone help close ${row.blockers} so this can move?`),
      })),
      ...stale.map((row) => ({
        ...item(row),
        ask: "Is anyone free to pair on this, or should we cut scope?",
      })),
    ],
    next: openSubtasks.slice(0, 3).map(cut),
  };
}

function openSubtasksOf(output: unknown): string[] {
  const subtasks = (output as { subtasks?: { title: string; status: string }[] } | undefined)
    ?.subtasks;
  return (subtasks ?? []).filter((s) => s.status === "todo").map((s) => s.title);
}

export const statusUpdaterMockScript: MockScript = ({ turn, userMessage, results }) => {
  const rows = parseTable(userMessage);
  if (!rows.some((row) => row.progress)) return call("ask_for_notes", askForNotes(rows));
  const firstChanged = rows.find((row) => row.progress)!;
  if (turn === 1) return call("get_task", { id: firstChanged.id });
  const task = results.find((r) => r.toolName === "get_task" && !r.isError);
  return call(
    "submit_status_update",
    draftUpdate(rows, chosenTone(userMessage), openSubtasksOf(task?.output)),
  );
};
