import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "not_found" });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    if (config().NODE_ENV === "production") {
      res.status(400).json({ error: "validation_error" });
    } else {
      res.status(400).json({ error: "validation_error", issues: err.issues });
    }
    return;
  }
  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({ error: "internal_error" });
}