import type { RequestHandler } from "express";
import { AppError } from "../lib/errors";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Stops a page on another site from changing data. A browser sends a cross-site form post or
 * no-cors fetch without asking, but only with a form or text/plain body, or none at all.
 * Content-Type: application/json needs a CORS preflight that the API never grants, so every
 * write must carry it. Browsers that send Sec-Fetch-Site are turned away before that.
 */
export const crossSiteGuard: RequestHandler = (req, _res, next) => {
  if (READ_METHODS.has(req.method)) return next();
  if (req.get("Sec-Fetch-Site") === "cross-site") {
    return next(new AppError(403, "forbidden", "Requests from another site cannot change data."));
  }
  const mediaType = req.get("Content-Type")?.split(";")[0]!.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return next(
      new AppError(
        415,
        "unsupported_media_type",
        "Send writes with Content-Type: application/json.",
      ),
    );
  }
  next();
};
