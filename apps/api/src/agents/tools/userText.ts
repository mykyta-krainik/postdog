const USER_TEXT_TAGS = new Map([
  ["title", "task"],
  ["description", "task"],
  ["body", "note"],
]);

const OPENING = /[<＜‹⟨〈﹤❮]/g;
const CLOSING = /[>＞›⟩〉﹥❯]/g;

/** Escapes angle brackets and their lookalikes, so user text cannot open or close a tag. */
export function escapeTags(text: string): string {
  return text.replace(OPENING, "&lt;").replace(CLOSING, "&gt;");
}

export function wrapTag(tag: string, text: string): string {
  return `<${tag}>${escapeTags(text)}</${tag}>`;
}

export function wrapTask(text: string): string {
  return wrapTag("task", text);
}

/** Wraps every title and description in <task> tags and every note body in <note> tags. */
export function tagUserText<T>(value: T): T {
  if (Array.isArray(value)) return value.map(tagUserText) as T;
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => {
      const tag = USER_TEXT_TAGS.get(key);
      return [key, tag && typeof field === "string" ? wrapTag(tag, field) : tagUserText(field)];
    }),
  ) as T;
}
