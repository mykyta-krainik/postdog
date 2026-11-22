const USER_TEXT_FIELDS = new Set(["title", "description"]);

export function escapeTags(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function wrapTask(text: string): string {
  return `<task>${escapeTags(text)}</task>`;
}

export function tagUserText<T>(value: T): T {
  if (Array.isArray(value)) return value.map(tagUserText) as T;
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [
      key,
      USER_TEXT_FIELDS.has(key) && typeof field === "string" ? wrapTask(field) : tagUserText(field),
    ]),
  ) as T;
}
