"use client";

import type { ResearchActionInput } from "@/lib/research/model";

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
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? "The request could not be completed.", response.status);
  return body as T;
}

export function postAction<T = Record<string, unknown>>(tenantId: string, projectId: string, action: ResearchActionInput) {
  return api<{ ok: true; result: T }>(`/api/research/tenants/${tenantId}/projects/${projectId}`, {
    method: "POST",
    body: JSON.stringify(action),
  }).then((response) => response.result);
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
