import { createRemoteJWKSet, jwtVerify } from "jose";
import { config } from "../config.js";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (jwks) return jwks;
  const cfg = config();
  const kcUrl = cfg.KEYCLOAK_URL.replace(/\/+$/, "");
  const issuer = `${kcUrl}/realms/${cfg.KEYCLOAK_REALM}`;
  const jwksUri = `${issuer}/protocol/openid-connect/certs`;
  jwks = createRemoteJWKSet(new URL(jwksUri), {
    cooldownDuration: cfg.KEYCLOAK_JWKS_CACHE_TTL * 1000,
    cacheMaxAge: cfg.KEYCLOAK_JWKS_CACHE_TTL * 1000
  });
  return jwks;
}

export interface VerifiedUser {
  sub: string;
  preferredUsername?: string;
  email?: string;
  roles: string[];
  raw: Record<string, unknown>;
}

export async function verifyJwt(token: string): Promise<VerifiedUser> {
  if (!token || typeof token !== "string") {
    throw new Error("Missing token");
  }
  const cfg = config();
  const kcUrl = cfg.KEYCLOAK_URL.replace(/\/+$/, "");
  const issuer = `${kcUrl}/realms/${cfg.KEYCLOAK_REALM}`;
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer,
    algorithms: ["RS256"]
  });
  const roles = extractRoles(payload);
  return {
    sub: String(payload.sub ?? ""),
    preferredUsername: payload.preferred_username as string | undefined,
    email: payload.email as string | undefined,
    roles,
    raw: payload as Record<string, unknown>
  };
}

function extractRoles(payload: Record<string, unknown>): string[] {
  const realmAccess = payload.realm_access as { roles?: string[] } | undefined;
  return realmAccess?.roles ?? [];
}

export function resetJwksForTest(): void {
  jwks = null;
}