import type { Request, RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { validationError } from '../lib/errors';

type DefaultParams = Request['params'];
type DefaultQuery = Request['query'];

/**
 * Parses each request part with its schema and replaces it with the parsed value,
 * so the controller after it in the route reads typed, defaulted input. The type
 * parameters only let Express accept that typed controller; they do not prove the
 * route passes the controller's schema. Express 5 exposes `req.query` as a getter,
 * so the parsed query is defined on the request instead of assigned.
 */
export function validate<P = DefaultParams, Q = DefaultQuery, B = unknown>(schemas: {
  params?: ZodType<P>;
  query?: ZodType<Q>;
  body?: ZodType<B>;
}): RequestHandler<P, unknown, B, Q> {
  return (req, _res, next) => {
    const issues: { path: string; message: string }[] = [];
    const parse = (schema: ZodType | undefined, value: unknown) => {
      if (!schema) return value;
      const result = schema.safeParse(value);
      if (result.success) return result.data;
      for (const issue of result.error.issues) {
        issues.push({ path: issue.path.join('.'), message: issue.message });
      }
      return value;
    };

    const params = parse(schemas.params, req.params);
    const query = parse(schemas.query, req.query);
    const body = parse(schemas.body, req.body);
    if (issues.length > 0) return next(validationError(issues));

    req.params = params as P;
    Object.defineProperty(req, 'query', { value: query, enumerable: true });
    req.body = body as B;
    next();
  };
}
