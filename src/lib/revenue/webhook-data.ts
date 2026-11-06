import "server-only";

import { randomBytes } from "node:crypto";

import type { z } from "zod";

import { FleetError } from "@/lib/fleet/platform/session";
import { appendAuditEvent } from "@/lib/fleet/platform/tenants";

import { col, nowIso, requireDoc, requireRole, type TenantContext } from "./data";
import { dispatchWebhooks, type DeliveryRecord } from "./delivery";
import { ADMIN_ROLES, REVENUE_SLUG as SLUG } from "./schemas";
import { MAX_WEBHOOKS, secretHint, TEST_EVENT, validateWebhookUrl, WEBHOOK_EVENTS, type WebhookEvent } from "./webhooks";
import type { webhookSchema } from "./schemas";

type WebhookDoc = { id: string; url: string; events: WebhookEvent[]; active: boolean; secret: string; createdAt: string; createdBy: string };

export type WebhookSummary = Omit<WebhookDoc, "secret"> & { secretHint: string };

const summarize = ({ secret, ...hook }: WebhookDoc): WebhookSummary => ({
  ...hook,
  events: (hook.events ?? []).filter((event) => (WEBHOOK_EVENTS as readonly string[]).includes(event)),
  secretHint: secretHint(secret),
});

/** Creates a webhook and returns its signing secret exactly once; later reads only show a hint. */
export async function createWebhook(ctx: TenantContext, input: z.infer<typeof webhookSchema>) {
  requireRole(ctx, ADMIN_ROLES);
  const check = validateWebhookUrl(input.url);
  if (!check.ok) throw new FleetError(check.reason, 422);
  const existing = await col(ctx.tenantId, "webhooks").get();
  if (existing.size >= MAX_WEBHOOKS) throw new FleetError(`A workspace can have up to ${MAX_WEBHOOKS} webhooks.`, 409);
  const ref = col(ctx.tenantId, "webhooks").doc();
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const record: WebhookDoc = { id: ref.id, url: check.url, events: [...new Set(input.events)], active: true, secret, createdAt: nowIso(), createdBy: ctx.user.email };
  await ref.set(record);
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "webhook.created", { type: "webhook", id: ref.id }, { url: check.url, events: record.events });
  return { webhook: summarize(record), secret };
}

export async function listWebhooks(ctx: TenantContext) {
  requireRole(ctx, ADMIN_ROLES);
  const [hooks, deliveries] = await Promise.all([
    col(ctx.tenantId, "webhooks").get(),
    col(ctx.tenantId, "webhookDeliveries").orderBy("attemptedAt", "desc").limit(50).get(),
  ]);
  return {
    webhooks: hooks.docs.map((doc) => summarize({ ...(doc.data() as WebhookDoc), id: doc.id })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    deliveries: deliveries.docs.map((doc) => ({ ...(doc.data() as DeliveryRecord), id: doc.id })),
  };
}

export async function setWebhookActive(ctx: TenantContext, webhookId: string, active: boolean) {
  requireRole(ctx, ADMIN_ROLES);
  const hook = await requireDoc<WebhookDoc>(ctx.tenantId, "webhooks", webhookId, "Webhook");
  if (hook.active === active) throw new FleetError("Nothing changed.", 400);
  await col(ctx.tenantId, "webhooks").doc(webhookId).update({ active });
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, active ? "webhook.enabled" : "webhook.disabled", { type: "webhook", id: webhookId }, { url: hook.url });
}

export async function deleteWebhook(ctx: TenantContext, webhookId: string) {
  requireRole(ctx, ADMIN_ROLES);
  const hook = await requireDoc<WebhookDoc>(ctx.tenantId, "webhooks", webhookId, "Webhook");
  await col(ctx.tenantId, "webhooks").doc(webhookId).delete();
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "webhook.deleted", { type: "webhook", id: webhookId }, { url: hook.url });
}

/** Sends a signed `webhook.test` event to one endpoint (active or not) and returns the logged attempt. */
export async function sendTestWebhook(ctx: TenantContext, webhookId: string) {
  requireRole(ctx, ADMIN_ROLES);
  await requireDoc<WebhookDoc>(ctx.tenantId, "webhooks", webhookId, "Webhook");
  const [delivery] = await dispatchWebhooks(ctx.tenantId, TEST_EVENT, { message: "Test delivery from SaaSassin Revenue.", sentBy: ctx.user.email }, { ...ctx.delivery, onlyWebhookId: webhookId });
  await appendAuditEvent(SLUG, ctx.tenantId, ctx.user, "webhook.tested", { type: "webhook", id: webhookId }, { status: delivery?.status ?? "failed" });
  if (!delivery) throw new FleetError("The test delivery could not be recorded.", 500);
  return delivery;
}
