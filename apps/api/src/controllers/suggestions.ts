import type {
  AcceptSuggestionInput,
  AcceptSuggestionResponse,
  IdParams,
  ListSuggestionsQuery,
  ListSuggestionsResponse,
  RejectSuggestionResponse,
} from '@postdog/shared';
import type { Request, Response } from 'express';
import type { SuggestionService } from '../services/suggestions';

export function createSuggestionController(suggestions: SuggestionService) {
  return {
    list: (
      req: Request<unknown, unknown, unknown, ListSuggestionsQuery>,
      res: Response<ListSuggestionsResponse>,
    ) => {
      res.json({ items: suggestions.list(req.query) });
    },
    accept: (
      req: Request<IdParams, unknown, AcceptSuggestionInput>,
      res: Response<AcceptSuggestionResponse>,
    ) => {
      res.json(suggestions.accept(req.params.id, req.body));
    },
    reject: (req: Request<IdParams>, res: Response<RejectSuggestionResponse>) => {
      res.json(suggestions.reject(req.params.id));
    },
  };
}

export type SuggestionController = ReturnType<typeof createSuggestionController>;
