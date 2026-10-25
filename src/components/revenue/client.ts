import type { getCallDetail, loadWorkspace } from "@/lib/revenue/data";

export type Workspace = Awaited<ReturnType<typeof loadWorkspace>>;
export type CallDetail = Awaited<ReturnType<typeof getCallDetail>>;
export type WorkspaceDeal = Workspace["deals"][number];
export type WorkspaceCall = Workspace["calls"][number];

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status}).`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body as T;
}

export function money(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-US")}`;
  }
}

export function shortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function daysAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function percent(ratio: number | null | undefined) {
  return ratio === null || ratio === undefined ? "—" : `${Math.round(ratio * 100)}%`;
}
