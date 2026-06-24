import { z } from "zod";

const PLACEHOLDER_SECRETS = new Set(["changeme", "change-me", "your-key", "replace-me", ""]);

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  DATABASE_URL: z.string().default("file:./data/freelance.db"),
  KEYCLOAK_URL: z.string().url().trim(),
  KEYCLOAK_REALM: z.string().default("master"),
  KEYCLOAK_CLIENT_ID: z.string().default("freelance-daigest"),
  KEYCLOAK_JWKS_CACHE_TTL: z.coerce.number().int().positive().default(600),
  OPENWEBUI_BASE_URL: z.string().url(),
  OPENWEBUI_API_KEY: z
    .string()
    .min(1)
    .refine((v) => !PLACEHOLDER_SECRETS.has(v.trim().toLowerCase()), {
      message: "OPENWEBUI_API_KEY must be a real key, not a placeholder"
    }),
  OPENWEBUI_MODEL: z.string().default("llama3.1:latest"),
  OPENWEBUI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  CRON_SCHEDULE: z.string().default("0 6 * * *"),
  SEARCH_TERMS: z.string().default("fullstack,frontend,entwickler"),
  SCRAPER_MAX_PAGES: z.coerce.number().int().positive().default(1),
  SCRAPER_DELAY_MS: z.coerce.number().int().nonnegative().default(1500),
  AUTO_GENERATE_ON_SCRAPE: z
    .union([z.string(), z.boolean()])
    .transform((v) => v === true || v === "true")
    .default(false),
  CONTACT_EMAIL: z.string().email().default("you@example.com"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  AUTH_DISABLED: z
    .union([z.string(), z.boolean()])
    .transform((v) => v === true || v === "true")
    .default(false),
  AUTH_DISABLED_IN_PROD: z
    .union([z.string(), z.boolean()])
    .transform((v) => v === true || v === "true")
    .default(false),
  CORS_ORIGIN: z.string().default("http://localhost:5173,http://localhost:8080")
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function config(): AppConfig {
  if (!cached) {
    return loadConfig();
  }
  return cached;
}

export function searchTerms(): string[] {
  return config()
    .SEARCH_TERMS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}