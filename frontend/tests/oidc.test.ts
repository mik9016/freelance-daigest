import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { UserManager } from "oidc-client-ts";
import { mockUserManager, events } from "./setup";

type OidcModule = typeof import("../src/auth/oidc");

let oidc: OidcModule;
let nav: { href: string; assign: ReturnType<typeof vi.fn>; pathname: string; origin: string };
let originalLocationDescriptor: PropertyDescriptor | undefined;

function makeUser(over: Partial<{ access_token: string; expired: boolean; state: string }> = {}) {
  return {
    access_token: "tok",
    expired: false,
    state: undefined as string | undefined,
    ...over
  } as unknown as Awaited<ReturnType<UserManager["getUser"]>>;
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  events.clear();

  mockUserManager.getUser.mockReset();
  mockUserManager.signinRedirect.mockReset();
  mockUserManager.signinRedirectCallback.mockReset();
  mockUserManager.signinSilent.mockReset();
  mockUserManager.signinSilentCallback.mockReset();
  mockUserManager.signoutRedirect.mockReset();
  mockUserManager.removeUser.mockReset();
  mockUserManager.stopSilentRenew.mockReset();
  mockUserManager.metadataService.getEndSessionEndpoint.mockReset();

  if (!originalLocationDescriptor) {
    originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, "location");
  }
  nav = {
    href: "http://localhost/",
    assign: vi.fn(),
    pathname: "/",
    origin: "http://localhost"
  };
  Object.defineProperty(window, "location", {
    value: nav,
    writable: true,
    configurable: true
  });

  oidc = await import("../src/auth/oidc");
});

afterEach(() => {
  if (originalLocationDescriptor) {
    Object.defineProperty(window, "location", originalLocationDescriptor);
  }
  vi.unstubAllGlobals();
});

describe("initOidc", () => {
  it("is idempotent — second call returns same promise, UserManager created once", async () => {
    mockUserManager.getUser.mockResolvedValue(makeUser());
    const p1 = oidc.initOidc();
    const p2 = oidc.initOidc();
    expect(p1).toBe(p2);
    await p1;
    expect(UserManager).toHaveBeenCalledTimes(1);
    expect(mockUserManager.getUser).toHaveBeenCalledTimes(1);
  });

  it("stores non-expired user → isAuthenticated true, getToken returns token", async () => {
    mockUserManager.getUser.mockResolvedValue(makeUser({ access_token: "abc", expired: false }));
    await oidc.initOidc();
    expect(oidc.isAuthenticated()).toBe(true);
    expect(oidc.getToken()).toBe("abc");
  });

  it("stores null user → isAuthenticated false, getToken undefined", async () => {
    mockUserManager.getUser.mockResolvedValue(null);
    await oidc.initOidc();
    expect(oidc.isAuthenticated()).toBe(false);
    expect(oidc.getToken()).toBeUndefined();
  });

  it("getUser rejection → initOidc rejects, no partial state", async () => {
    mockUserManager.getUser.mockRejectedValue(new Error("network"));
    await expect(oidc.initOidc()).rejects.toThrow("network");
    expect(oidc.isAuthenticated()).toBe(false);
    expect(oidc.getToken()).toBeUndefined();
  });
});

describe("login", () => {
  it("calls signinRedirect with current pathname as state", async () => {
    nav.pathname = "/dashboard";
    mockUserManager.signinRedirect.mockResolvedValue(undefined);
    await oidc.login();
    expect(mockUserManager.signinRedirect).toHaveBeenCalledWith({ state: "/dashboard" });
  });

  it("uses / as state when on /login to avoid post-callback loop", async () => {
    nav.pathname = "/login";
    mockUserManager.signinRedirect.mockResolvedValue(undefined);
    await oidc.login();
    expect(mockUserManager.signinRedirect).toHaveBeenCalledWith({ state: "/" });
  });
});

describe("handleSigninCallback", () => {
  it("reads state and redirects to it", async () => {
    mockUserManager.signinRedirectCallback.mockResolvedValue(makeUser({ state: "/profile" }));
    await oidc.handleSigninCallback();
    expect(mockUserManager.signinRedirectCallback).toHaveBeenCalledTimes(1);
    expect(nav.href).toBe("/profile");
  });

  it("falls back to / when state missing", async () => {
    mockUserManager.signinRedirectCallback.mockResolvedValue(makeUser({ state: undefined }));
    await oidc.handleSigninCallback();
    expect(nav.href).toBe("/");
  });

  it("rejects open-redirect state — falls back to /", async () => {
    mockUserManager.signinRedirectCallback.mockResolvedValue(makeUser({ state: "//evil.com/path" }));
    await oidc.handleSigninCallback();
    expect(nav.href).toBe("/");
  });

  it("rejects backslash state — falls back to /", async () => {
    mockUserManager.signinRedirectCallback.mockResolvedValue(makeUser({ state: "/\\evil.com" }));
    await oidc.handleSigninCallback();
    expect(nav.href).toBe("/");
  });

  it("rejects javascript: state — falls back to /", async () => {
    mockUserManager.signinRedirectCallback.mockResolvedValue(makeUser({ state: "javascript:alert(1)" }));
    await oidc.handleSigninCallback();
    expect(nav.href).toBe("/");
  });
});

describe("logout", () => {
  it("calls signoutRedirect when end_session_endpoint present", async () => {
    mockUserManager.metadataService.getEndSessionEndpoint.mockResolvedValue("https://kc.test/logout");
    mockUserManager.signoutRedirect.mockResolvedValue(undefined);
    await oidc.logout();
    expect(mockUserManager.signoutRedirect).toHaveBeenCalledTimes(1);
    expect(mockUserManager.removeUser).not.toHaveBeenCalled();
  });

  it("falls back to removeUser + redirect /login when no end_session_endpoint", async () => {
    mockUserManager.metadataService.getEndSessionEndpoint.mockResolvedValue(null);
    mockUserManager.removeUser.mockResolvedValue(undefined);
    await oidc.logout();
    expect(mockUserManager.removeUser).toHaveBeenCalledTimes(1);
    expect(nav.href).toBe("/login");
  });
});

describe("getToken / isAuthenticated", () => {
  it("getToken present after init with user", async () => {
    mockUserManager.getUser.mockResolvedValue(makeUser({ access_token: "X" }));
    await oidc.initOidc();
    expect(oidc.getToken()).toBe("X");
  });

  it("getToken undefined when no user", async () => {
    mockUserManager.getUser.mockResolvedValue(null);
    await oidc.initOidc();
    expect(oidc.getToken()).toBeUndefined();
  });

  it("isAuthenticated false when user null", async () => {
    mockUserManager.getUser.mockResolvedValue(null);
    await oidc.initOidc();
    expect(oidc.isAuthenticated()).toBe(false);
  });

  it("isAuthenticated false when user expired", async () => {
    mockUserManager.getUser.mockResolvedValue(makeUser({ expired: true }));
    await oidc.initOidc();
    expect(oidc.isAuthenticated()).toBe(false);
  });

  it("isAuthenticated true when user present and not expired", async () => {
    mockUserManager.getUser.mockResolvedValue(makeUser({ expired: false }));
    await oidc.initOidc();
    expect(oidc.isAuthenticated()).toBe(true);
  });
});

describe("updateTokenIfNeeded", () => {
  it("calls signinSilent and stores new user", async () => {
    mockUserManager.getUser.mockResolvedValue(null);
    await oidc.initOidc();
    mockUserManager.signinSilent.mockResolvedValue(makeUser({ access_token: "fresh", expired: false }));
    await oidc.updateTokenIfNeeded();
    expect(mockUserManager.signinSilent).toHaveBeenCalledTimes(1);
    expect(oidc.getToken()).toBe("fresh");
  });

  it("dedupes concurrent calls — single signinSilent, same promise", async () => {
    let resolveSilent: (u: unknown) => void = () => {};
    mockUserManager.signinSilent.mockImplementation(
      () => new Promise((r) => { resolveSilent = r; })
    );
    const a = oidc.updateTokenIfNeeded();
    const b = oidc.updateTokenIfNeeded();
    const c = oidc.updateTokenIfNeeded();
    expect(mockUserManager.signinSilent).toHaveBeenCalledTimes(1);
    resolveSilent(makeUser({ access_token: "Y", expired: false }));
    await Promise.all([a, b, c]);
  });

  it("throws on signinSilent rejection and clears in-flight", async () => {
    mockUserManager.signinSilent.mockRejectedValueOnce(new Error("network"));
    await expect(oidc.updateTokenIfNeeded()).rejects.toThrow("network");
    mockUserManager.signinSilent.mockResolvedValueOnce(makeUser({ access_token: "ok", expired: false }));
    await oidc.updateTokenIfNeeded();
    expect(mockUserManager.signinSilent).toHaveBeenCalledTimes(2);
  });
});

describe("stopRefresh", () => {
  it("calls userManager.stopSilentRenew", async () => {
    mockUserManager.getUser.mockResolvedValue(null);
    await oidc.initOidc();
    await oidc.stopRefresh();
    expect(mockUserManager.stopSilentRenew).toHaveBeenCalledTimes(1);
  });
});

describe("events", () => {
  it("silentRenewError redirects to /login", async () => {
    mockUserManager.getUser.mockResolvedValue(makeUser());
    await oidc.initOidc();
    const cbs = events.get("addSilentRenewError");
    expect(cbs).toHaveLength(1);
    cbs![0]!(new Error("renew failed"));
    expect(nav.href).toBe("/login");
  });

  it("accessTokenExpired clears user and redirects to /login", async () => {
    mockUserManager.getUser.mockResolvedValue(makeUser({ access_token: "T" }));
    await oidc.initOidc();
    expect(oidc.isAuthenticated()).toBe(true);
    const cbs = events.get("addAccessTokenExpired");
    expect(cbs).toHaveLength(1);
    cbs![0]!();
    expect(oidc.isAuthenticated()).toBe(false);
    expect(oidc.getToken()).toBeUndefined();
    expect(nav.href).toBe("/login");
  });
});