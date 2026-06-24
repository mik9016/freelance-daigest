import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { verifyJwt, type VerifiedUser } from "../auth/keycloak.js";
import { logger } from "../lib/logger.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: VerifiedUser;
  }
}

function authDisabledAllowed(): boolean {
  const cfg = config();
  if (!cfg.AUTH_DISABLED) return false;
  if (cfg.NODE_ENV === "production") {
    return cfg.AUTH_DISABLED_IN_PROD;
  }
  return true;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (authDisabledAllowed()) {
    if (config().NODE_ENV === "production") {
      logger.warn("AUTH_DISABLED is enabled in production — all endpoints are unauthenticated");
    }
    req.user = {
      sub: "auth-disabled",
      roles: ["admin"],
      raw: {}
    };
    next();
    return;
  }
  const header = req.headers.authorization ?? "";
  const match = header.match(/^\s*bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const token = match[1]!.trim();
  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    req.user = await verifyJwt(token);
    next();
  } catch (err) {
    logger.debug({ err: (err as Error).message }, "JWT verification failed");
    res.status(401).json({ error: "unauthorized" });
  }
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.roles.includes(role)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}