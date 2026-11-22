import {
  acceptSuggestionInputSchema,
  idParamsSchema,
  listSuggestionsQuerySchema,
} from "@postdog/shared";
import { Router, type RequestHandler } from "express";
import type { SuggestionController } from "../controllers/suggestions";
import { validate } from "../middleware/validate";

export function suggestionRoutes(suggestions: SuggestionController, guard: RequestHandler): Router {
  const byId = { params: idParamsSchema };
  return Router()
    .use(guard)
    .get("/", validate({ query: listSuggestionsQuerySchema }), suggestions.list)
    .post(
      "/:id/accept",
      validate({ ...byId, body: acceptSuggestionInputSchema }),
      suggestions.accept,
    )
    .post("/:id/reject", validate(byId), suggestions.reject);
}
