import type { getPostThread, getWorkspace } from "@/lib/community/data";
import type { CommunityAction } from "@/lib/community/model";

export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
export type Thread = Awaited<ReturnType<typeof getPostThread>>;
export type WorkspacePost = Workspace["posts"][number];
export type WorkspaceSpace = Workspace["spaces"][number];
export type WorkspaceMember = Workspace["members"][number];

/** SaaSassin paper/ink card: hard border plus offset shadow. */
export const paperCard = "rounded-xl border-2 border-[var(--ink)] bg-[var(--paper-strong)] shadow-[4px_4px_0_var(--ink)]";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error ?? "Something went wrong. Try again.", response.status);
  return body as T;
}

export function runCommunityAction<T = unknown>(tenantId: string, action: CommunityAction) {
  return api<{ result: T }>(`/api/community/tenants/${tenantId}/actions`, { method: "POST", body: JSON.stringify(action) });
}

export function formatWhen(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}
