type Level = "info" | "warn" | "error";

function write(level: Level, message: string, fields?: Record<string, unknown>): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}`;
  const stream = level === "info" ? console.log : console.error;
  if (fields) stream(line, fields);
  else stream(line);
}

export const logger = {
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};
