import "@testing-library/jest-dom";
import { vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const events = new Map<string, ((...args: unknown[]) => void)[]>();
  const mockUserManager = {
    getUser: vi.fn(),
    signinRedirect: vi.fn(),
    signinRedirectCallback: vi.fn(),
    signinSilent: vi.fn(),
    signinSilentCallback: vi.fn(),
    signoutRedirect: vi.fn(),
    removeUser: vi.fn(),
    stopSilentRenew: vi.fn(),
    metadataService: {
      getEndSessionEndpoint: vi.fn()
    },
    events: {
      addSilentRenewError: vi.fn((cb: (...a: unknown[]) => void) => {
        const list = events.get("addSilentRenewError") ?? [];
        list.push(cb);
        events.set("addSilentRenewError", list);
      }),
      addAccessTokenExpired: vi.fn((cb: (...a: unknown[]) => void) => {
        const list = events.get("addAccessTokenExpired") ?? [];
        list.push(cb);
        events.set("addAccessTokenExpired", list);
      }),
      addAccessTokenExpiring: vi.fn((cb: (...a: unknown[]) => void) => {
        const list = events.get("addAccessTokenExpiring") ?? [];
        list.push(cb);
        events.set("addAccessTokenExpiring", list);
      })
    }
  };
  return {
    events,
    mockUserManager,
    setMockUser: vi.fn(),
    emit: vi.fn(),
    resetOidcMocks: vi.fn()
  };
});

vi.mock("oidc-client-ts", () => ({
  UserManager: vi.fn(() => hoisted.mockUserManager),
  WebStorageStateStore: class {}
}));

const env = import.meta.env as Record<string, string>;
env.VITE_API_BASE_URL = "/api";
env.VITE_OIDC_AUTHORITY = "https://kc.test/realms/test";
env.VITE_OIDC_CLIENT_ID = "test-client";
env.VITE_OIDC_SCOPES = "openid profile email";

export const { events, mockUserManager, emit, setMockUser, resetOidcMocks } = hoisted;