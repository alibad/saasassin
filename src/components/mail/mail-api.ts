"use client";

import type { MailAddress } from "@/lib/mail/mime";
import type { ProviderStatus } from "@/lib/mail/provider";
import type { SearchHit, SplitRule, ThreadAction, ThreadRecord } from "@/lib/mail/workflow";

export type Tenant = { id: string; name: string; role: string };

export type Draft = {
  id: string;
  threadId: string | null;
  to: string;
  cc: string;
  subject: string;
  body: string;
  status: string;
  updatedAt: string | null;
};

export type Template = { id: string; name: string; body: string };

export type ImportRun = { id: string; fileName: string; parsed: number; imported: number; duplicates: number; failed: number; createdAt: string | null };

export type Mailbox = {
  role: string;
  threads: ThreadRecord[];
  splits: SplitRule[];
  drafts: Draft[];
  templates: Template[];
  imports: ImportRun[];
  providers: ProviderStatus[];
};

export type Message = {
  id: string;
  messageId: string;
  threadId: string;
  subject: string;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  date: string | null;
  text: string;
  bodySource: string;
  hasCalendarInvite: boolean;
  listUnsubscribe: string | null;
  attachments: { filename: string; contentType: string; size: number }[];
};

export type AuditEvent = {
  id: string;
  action: string;
  actor: { uid: string; email: string };
  target: { type: string; id: string };
  details: Record<string, unknown>;
  occurredAt: string | null;
};

export type Member = { uid: string; email: string; name: string; role: string; status: string };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(String((data as { error?: string }).error ?? "The request failed."), response.status);
  return data as T;
}

export function tenantPath(tenantId: string, suffix = "") {
  return `/api/mail/tenants/${encodeURIComponent(tenantId)}${suffix}`;
}

export type { MailAddress, ProviderStatus, SearchHit, SplitRule, ThreadAction, ThreadRecord };
