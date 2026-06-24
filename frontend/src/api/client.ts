import { getToken, updateTokenIfNeeded } from "../auth/oidc";

const BASE = (import.meta.env.VITE_API_BASE_URL as string) || "/api";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const doFetch = () =>
    fetch(`${BASE}${path}`, { ...init, headers, credentials: "same-origin" });

  let res = await doFetch();
  if (res.status === 401) {
    try {
      await updateTokenIfNeeded();
    } catch {
      // ignore — will rethrow 401 below
    }
    const newToken = getToken();
    if (newToken) headers.set("Authorization", `Bearer ${newToken}`);
    res = await doFetch();
    if (res.status === 401) {
      window.location.href = "/login";
      throw new Error("unauthorized");
    }
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = { error: "request_failed" };
    }
    throw Object.assign(new Error("request_failed"), { status: res.status, body });
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" })
};