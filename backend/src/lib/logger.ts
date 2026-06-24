import pino from "pino";
import { config } from "../config.js";

export const logger = pino({
  level: config().LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "headers.authorization",
      "headers.Authorization",
      "Authorization",
      "OPENWEBUI_API_KEY",
      "*.OPENWEBUI_API_KEY",
      "apiKey",
      "config.headers.authorization",
      "config.headers.Authorization",
      "request.headers.authorization",
      "request._header",
      "err.config.headers.authorization",
      "err.config.headers.Authorization",
      "err.request._header",
      "err.request.headers.authorization",
      "*.headers.authorization",
      "*.headers.Authorization"
    ],
    censor: "[REDACTED]"
  }
});

export type Logger = typeof logger;