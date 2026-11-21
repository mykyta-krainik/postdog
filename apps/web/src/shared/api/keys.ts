export type QueryValue = string | number | boolean | null | undefined;

const API_PREFIX = "/api";

/**
 * Builds an SWR key, which is also the URL the fetcher requests.
 * Query params are sorted and empty values dropped, so equal queries give equal keys.
 */
export function apiKey(path: `/${string}`, query: Record<string, QueryValue> = {}): string {
  const params = new URLSearchParams();
  for (const name of Object.keys(query).sort()) {
    const value = query[name];
    if (value === undefined || value === null || value === "") continue;
    params.append(name, String(value));
  }
  const search = params.toString();
  return `${API_PREFIX}${path}${search ? `?${search}` : ""}`;
}

/** True when an SWR key addresses the resource at path or anything below it. */
export function matchesApiPath(key: unknown, path: `/${string}`): boolean {
  if (typeof key !== "string") return false;
  const base = `${API_PREFIX}${path}`;
  return key === base || key.startsWith(`${base}/`) || key.startsWith(`${base}?`);
}
