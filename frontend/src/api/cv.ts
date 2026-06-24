import { getToken } from "../auth/oidc";

const BASE = (import.meta.env.VITE_API_BASE_URL as string) || "/api";

export interface CvMeta {
  id: number;
  filename: string;
  size: number;
  contentType: string;
  createdAt: string;
  isActive: boolean;
  contentPreview?: string;
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

async function authHeaders(): Promise<HeadersInit> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { body = { error: "request_failed" }; }
    throw Object.assign(new Error("request_failed"), { status: res.status, body });
  }
  return (await res.json()) as T;
}

export async function getActiveCv(): Promise<CvMeta | null> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/cv`, { headers });
  if (res.status === 404) return null;
  return handle<CvMeta>(res);
}

export async function listCvHistory(): Promise<CvMeta[]> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/cv/history`, { headers });
  return handle<CvMeta[]>(res);
}

export async function uploadCv(file: File): Promise<CvMeta> {
  const headers = new Headers(await authHeaders());
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(file.name)}"`);
  const buf = new Uint8Array(await file.arrayBuffer());
  const res = await fetch(`${BASE}/cv`, {
    method: "POST",
    headers,
    body: buf
  });
  return handle<CvMeta>(res);
}

export async function activateCv(id: number): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/cv/${id}/activate`, {
    method: "PATCH",
    headers
  });
  await handle<void>(res);
}

export async function deleteCv(id: number): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/cv/${id}`, {
    method: "DELETE",
    headers
  });
  await handle<void>(res);
}