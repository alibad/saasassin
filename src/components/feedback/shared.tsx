"use client";

import { STATUS_LABELS, type PostStatus } from "@/lib/feedback/model";
import type { Tag } from "@/lib/feedback/types";

import styles from "./feedback.module.css";

export async function apiJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? "The request failed.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export function StatusBadge({ status }: { status: PostStatus }) {
  return <span className={styles.status} data-status={status}>{STATUS_LABELS[status]}</span>;
}

export function TagChip({ tag }: { tag: Tag }) {
  return (
    <span className={styles.tag}>
      <span className={styles.tagDot} style={{ background: tag.color }} aria-hidden="true" />
      {tag.name}
    </span>
  );
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "just now";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "pending";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
