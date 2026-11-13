import type { getFeedPage, getPostThread, getWorkspace } from "@/lib/community/data";
import type { CommunityAction } from "@/lib/community/model";

export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
export type Thread = Awaited<ReturnType<typeof getPostThread>>;
export type FeedPage = Awaited<ReturnType<typeof getFeedPage>>;
export type WorkspacePost = Workspace["feed"]["posts"][number];
export type WorkspaceSpace = Workspace["spaces"][number];
export type WorkspaceMember = Workspace["members"][number];

/** A Community card: soft, rounded, on the lilac canvas. */
export const surface = "rounded-[var(--radius)] bg-card text-card-foreground ring-1 ring-border";

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

/** "5m", "3h", "2d", then a date: how social feeds show time. */
export function timeAgo(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "";
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return "";
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

export const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", moderator: "Moderator", member: "Member" };

/** Members by uid, for author photos, handles and role badges anywhere a person appears. */
export type PeopleIndex = Map<string, WorkspaceMember>;

export function peopleIndex(workspace: Workspace): PeopleIndex {
  return new Map(workspace.members.map((member) => [member.uid, member]));
}

/** The avatar data for someone, falling back to the name stored on the record (former members, imports). */
export function personFor(people: PeopleIndex, uid: string, fallbackName: string) {
  const member = people.get(uid);
  return { uid, name: member?.displayName || fallbackName, photoURL: member?.photoURL ?? null };
}
