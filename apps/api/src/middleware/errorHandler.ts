import type { ApiErrorBody } from "@postdog/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError, notFound } from "../lib/errors";
import { logger } from "../lib/logger";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`No route for ${req.method} ${req.path}`));
};

/** Body-parser failures (malformed JSON, too large, bad charset) carry a 4xx status. */
function clientHttpStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("status" in err)) return undefined;
  const { status } = err;
  return typeof status === "number" && status >= 400 && status < 500 ? status : undefined;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status: number;
  let body: ApiErrorBody;
  const clientStatus = clientHttpStatus(err);

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (clientStatus !== undefined && err instanceof Error) {
    status = clientStatus;
    body = { error: { code: "validation_error", message: err.message } };
  } else {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}`, { err });
    status = 500;
    body = { error: { code: "internal_error", message: "Internal server error" } };
  }

  res.status(status).json(body);
};
