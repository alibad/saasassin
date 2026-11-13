"use client";

export async function apiJson<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? "Something went wrong. Try again.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(date);
}

/** "3 hours ago", "yesterday", "Oct 4". */
export function timeAgo(value: string | null | undefined, now = Date.now()) {
  if (!value) return "";
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return "";
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(at));
}

/** A Creator card surface: soft, rounded, on the cream canvas. */
export const panelClass = "rounded-2xl border-0 bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)] ring-1 ring-border";

/** People the API joins onto records: name and photo by uid. */
export type PeopleRecord = Record<string, { name: string; title?: string; photoURL: string | null }>;
