import { Router } from "express";
import { config } from "../config.js";

export const authRouter = Router();

authRouter.get("/config", (_req, res) => {
  res.json({
    keycloakUrl: config().KEYCLOAK_URL,
    realm: config().KEYCLOAK_REALM,
    clientId: config().KEYCLOAK_CLIENT_ID
  });
});