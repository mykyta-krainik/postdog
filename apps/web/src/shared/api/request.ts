import type { z } from "zod";
import { ApiError, apiErrorFromBody } from "./api-error";

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Calls the API and parses the success body with a contract schema from @postdog/shared.
 * Throws ApiError for a failed request, an error response, or a body that breaks the contract.
 * For a 204 response, pass z.undefined().
 */
export async function apiRequest<Schema extends z.ZodType>(
  url: string,
  schema: Schema,
  { method = "GET", body, signal }: RequestOptions = {},
): Promise<z.output<Schema>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, "network_error", "Postdog can't reach the API.");
  }

  const json = await readJson(response);
  if (!response.ok) throw apiErrorFromBody(response.status, json);

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      "unexpected_response",
      `The API answered ${method} ${url} with an unexpected shape.`,
      parsed.error.issues,
    );
  }
  return parsed.data;
}

/** An SWR fetcher bound to one response schema. The SWR key is the URL. */
export function fetcherFor<Schema extends z.ZodType>(schema: Schema) {
  return (url: string) => apiRequest(url, schema);
}
