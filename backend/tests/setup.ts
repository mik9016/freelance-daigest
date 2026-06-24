import { beforeEach, vi } from "vitest";

// Ensure tests use a unique in-memory DB per test file
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file::memory:";
process.env.AUTH_DISABLED = "true";
process.env.OPENWEBUI_BASE_URL = "http://openwebui.test";
process.env.OPENWEBUI_API_KEY = "test-key";
process.env.OPENWEBUI_MODEL = "test-model";
process.env.KEYCLOAK_URL = "http://keycloak.test";
process.env.KEYCLOAK_REALM = "test";
process.env.KEYCLOAK_CLIENT_ID = "test-client";
process.env.SEARCH_TERMS = "fullstack,frontend,entwickler";
process.env.CONTACT_EMAIL = "test@example.com";
process.env.LOG_LEVEL = "error";
process.env.CRON_SCHEDULE = "0 6 * * *";

beforeEach(() => {
  vi.restoreAllMocks();
});