import type { AgentErrorCode, AgentName } from "@postdog/shared";

/** How each agent is named in the UI, and the headline shown while it works. */
export const AGENT_META: Record<AgentName, { label: string; working: string }> = {
  planner: { label: "Planner", working: "Planning your day" },
  decomposer: { label: "Decomposer", working: "Splitting tasks" },
  status_updater: { label: "Status updater", working: "Writing your update" },
  docs_reviewer: { label: "Docs reviewer", working: "Reviewing docs" },
};

/** What each failure code means for the user. The run's own message adds the details. */
export const AGENT_ERROR_LABEL: Record<AgentErrorCode, string> = {
  no_terminal_tool: "The model stopped without giving an answer",
  step_limit: "The agent hit its step limit",
  timeout: "The agent ran out of time",
  validation_failed: "The model's answer kept failing validation",
  llm_error: "The model call failed",
  nothing_valid: "Nothing in the answer passed the checks",
  cancelled: "The run was cancelled",
  interrupted: "The API restarted during the run",
  ai_disabled: "AI was turned off during the run",
  internal_error: "Something went wrong inside Postdog",
};
