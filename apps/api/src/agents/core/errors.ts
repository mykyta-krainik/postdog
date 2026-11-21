import type { AgentErrorCode, AgentRunError } from "@postdog/shared";

export class AgentError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    message: string,
  ) {
    super(message);
  }

  toRunError(): AgentRunError {
    return { code: this.code, message: this.message };
  }
}

export class ToolError extends Error {}
