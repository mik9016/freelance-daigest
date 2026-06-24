import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { logger } from "./lib/logger.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./routes/auth.js";
import { offersRouter } from "./routes/offers.js";
import { messagesRouter } from "./routes/messages.js";
import { scrapeRouter } from "./routes/scrape.js";
import { cvRouter } from "./routes/cv.js";
import { startCron } from "./jobs/cron.js";

function main() {
  loadConfigSafe();
  runMigrations();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(
    cors({
      origin: config().CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true
    })
  );

  // Generic rate limit for all API routes
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "rate_limited" }
    })
  );

  // Stricter limit on expensive LLM-scoped endpoints
  const aiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "rate_limited" }
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/offers", offersRouter);
  app.use("/api/offers", aiLimiter, messagesRouter);
  app.use("/api/scrape", scrapeRouter);
  app.use("/api/cv", aiLimiter, cvRouter);

  app.use(notFound);
  app.use(errorHandler);

  const port = config().PORT;
  const server = app.listen(port, () => {
    logger.info({ port }, "Backend listening");
  });

  startCron();

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

function loadConfigSafe() {
  try {
    config();
  } catch (err) {
    logger.error({ err }, "Configuration invalid");
    process.exit(1);
  }
}

main();