// Same-origin API client: the dashboard is served by the Worker and calls /api/*.
export class ApiError extends Error {
  constructor(readonly status: number, readonly name: string, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-novamail-client": "dashboard" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.name ?? "error", json.message ?? `HTTP ${res.status}`);
  return json as T;
}

export const API_BASE = "https://api.novamail.nexaclouds.online";
