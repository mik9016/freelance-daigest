import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";

const authority = import.meta.env.VITE_OIDC_AUTHORITY as string;
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID as string;
const scopes = (import.meta.env.VITE_OIDC_SCOPES as string) || "openid profile email";

let um: UserManager | null = null;
let initPromise: Promise<void> | null = null;
let currentUser: User | null = null;
let inFlight: Promise<User | null> | null = null;

function getUserManager(): UserManager {
  if (!um) {
    um = new UserManager({
      authority,
      client_id: clientId,
      redirect_uri: `${window.location.origin}/callback`,
      silent_redirect_uri: `${window.location.origin}/silent-renew`,
      post_logout_redirect_uri: `${window.location.origin}/login`,
      response_type: "code",
      scope: scopes,
      automaticSilentRenew: true,
      accessTokenExpiringNotificationTimeInSeconds: 60,
      userStore: new WebStorageStateStore({ store: window.localStorage })
    });
    um.events.addSilentRenewError(() => redirectToLogin());
    um.events.addAccessTokenExpired(() => {
      currentUser = null;
      redirectToLogin();
    });
  }
  return um;
}

export async function handleSilentRenewCallback(): Promise<void> {
  await getUserManager().signinSilentCallback();
}

export function initOidc(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = getUserManager()
    .getUser()
    .then((u) => {
      currentUser = u;
    });
  return initPromise;
}

export async function login(): Promise<void> {
  const pathname = window.location.pathname;
  const state = pathname && pathname !== "/login" ? pathname : "/";
  await getUserManager().signinRedirect({ state });
}

export async function handleSigninCallback(): Promise<void> {
  const u = await getUserManager().signinRedirectCallback();
  currentUser = u;
  const raw = u?.state as string | undefined;
  const target = isSafeRelativePath(raw) ? raw : "/";
  window.location.href = target;
}

function isSafeRelativePath(s: string | undefined): s is string {
  if (!s || typeof s !== "string") return false;
  if (!s.startsWith("/")) return false;
  if (s.startsWith("//") || s.startsWith("/\\")) return false;
  return /^\/[a-zA-Z0-9\-._~!$&'()*+,;=:@%\/]*$/.test(s);
}

export async function logout(): Promise<void> {
  const m = getUserManager();
  try {
    const endSession = await m.metadataService.getEndSessionEndpoint();
    if (endSession) {
      try {
        await m.signoutRedirect();
        return;
      } catch {
        /* fallthrough to removeUser */
      }
    }
  } catch {
    /* fallthrough to removeUser */
  }
  try {
    await m.removeUser();
  } catch {
    /* ignore */
  }
  currentUser = null;
  window.location.href = "/login";
}

export function getToken(): string | undefined {
  return currentUser?.access_token;
}

export function isAuthenticated(): boolean {
  return Boolean(currentUser && !currentUser.expired);
}

export async function updateTokenIfNeeded(): Promise<void> {
  if (inFlight) {
    await inFlight;
    return;
  }
  inFlight = getUserManager()
    .signinSilent()
    .then((u) => {
      currentUser = u;
      return u;
    });
  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}

export async function stopRefresh(): Promise<void> {
  if (um) um.stopSilentRenew();
}

function redirectToLogin(): void {
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}