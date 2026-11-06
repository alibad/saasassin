import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";

import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { toPortable } from "@/lib/fleet/platform/export";
import { FleetError, type FleetUser } from "@/lib/fleet/platform/session";
import { PRIVILEGED_ROLES } from "@/lib/fleet/platform/tenants";

import { audit, col, plannerContextFor, type PlannerContext } from "./data";
import { classifyDelivery, isPrivateAddress, SIGNATURE_HEADER, signatureHeader, validateWebhookUrl, WEBHOOK_EVENTS, type WebhookEvent } from "./webhooks";

/** Swappable transport so the emulator spec can capture deliveries without the network. */
export const webhookTransport = {
  fetch: (input: string, init: RequestInit) => globalThis.fetch(input, init),
  resolve: async (host: string) => (await lookup(host, { all: true })).map((entry) => entry.address),
  timeoutMs: 5000,
};

export const webhookSchema = z.object({
  url: z.string().trim().min(1, "Enter the endpoint URL.").max(500),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Pick at least one event.").max(WEBHOOK_EVENTS.length),
  description: z.string().trim().max(120).default(""),
});

export type WebhookSummary = {
  id: string;
  url: string;
  events: string[];
  description: string;
  createdAt: string | null;
  createdBy: string;
  secretHint: string;
};

export type DeliveryRecord = {
  id: string;
  webhookId: string;
  event: string;
  status: "delivered" | "failed";
  httpStatus: number | null;
  error: string | null;
  attemptedAt: string | null;
  durationMs: number;
};

const iso = (value: unknown) => {
  const portable = toPortable(value);
  return typeof portable === "string" ? portable : null;
};

export async function createWebhook(user: FleetUser, tenantId: string, raw: unknown) {
  const ctx = await plannerContextFor(user, tenantId, PRIVILEGED_ROLES);
  const input = webhookSchema.parse(raw);
  const checked = validateWebhookUrl(input.url);
  if (!checked.ok) throw new FleetError(checked.reason, 400);
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const ref = col(tenantId, "webhooks").doc();
  await ref.set({
    url: checked.url,
    events: [...new Set(input.events)].sort(),
    description: input.description,
    secret,
    secretHint: secret.slice(-4),
    createdBy: ctx.user.email,
    createdAt: FieldValue.serverTimestamp(),
  });
  await audit(ctx, "webhook.created", { type: "webhook", id: ref.id }, { url: checked.url, events: input.events });
  // The secret is returned exactly once; it is never readable again through the API or the export.
  return { id: ref.id, secret };
}

export async function listWebhooks(user: FleetUser, tenantId: string) {
  await plannerContextFor(user, tenantId, PRIVILEGED_ROLES);
  const [hooks, deliveries] = await Promise.all([
    col(tenantId, "webhooks").orderBy("createdAt").get(),
    col(tenantId, "webhookDeliveries").orderBy("attemptedAt", "desc").limit(50).get(),
  ]);
  const webhooks: WebhookSummary[] = hooks.docs.map((doc) => ({
    id: doc.id,
    url: String(doc.get("url")),
    events: (doc.get("events") ?? []) as string[],
    description: String(doc.get("description") ?? ""),
    createdAt: iso(doc.get("createdAt")),
    createdBy: String(doc.get("createdBy") ?? ""),
    secretHint: String(doc.get("secretHint") ?? ""),
  }));
  const log: DeliveryRecord[] = deliveries.docs.map((doc) => ({
    id: doc.id,
    webhookId: String(doc.get("webhookId")),
    event: String(doc.get("event")),
    status: doc.get("status") === "delivered" ? "delivered" : "failed",
    httpStatus: doc.get("httpStatus") ?? null,
    error: doc.get("error") ?? null,
    attemptedAt: iso(doc.get("attemptedAt")),
    durationMs: Number(doc.get("durationMs") ?? 0),
  }));
  return { webhooks, deliveries: log };
}

export async function deleteWebhook(user: FleetUser, tenantId: string, webhookId: string) {
  const ctx = await plannerContextFor(user, tenantId, PRIVILEGED_ROLES);
  const ref = col(tenantId, "webhooks").doc(webhookId);
  const doc = await ref.get();
  if (!doc.exists) throw new FleetError("Webhook not found.", 404);
  await ref.delete();
  await audit(ctx, "webhook.deleted", { type: "webhook", id: webhookId }, { url: doc.get("url") });
  return { ok: true };
}

export async function sendTestWebhook(user: FleetUser, tenantId: string, webhookId: string) {
  const ctx = await plannerContextFor(user, tenantId, PRIVILEGED_ROLES);
  const doc = await col(tenantId, "webhooks").doc(webhookId).get();
  if (!doc.exists) throw new FleetError("Webhook not found.", 404);
  const [delivery] = await deliverTo(ctx, [doc], "webhook.test", { message: "Test delivery from SaaSassin Planner." });
  await audit(ctx, "webhook.tested", { type: "webhook", id: webhookId }, { status: delivery.status, httpStatus: delivery.httpStatus });
  return delivery;
}

async function checkHost(url: string) {
  const host = new URL(url).hostname;
  if (isPrivateAddress(host)) return "Private or internal hosts cannot receive webhooks.";
  try {
    const addresses = await webhookTransport.resolve(host);
    if (addresses.length === 0) return `Could not resolve ${host}.`;
    if (addresses.some(isPrivateAddress)) return `${host} resolves to a private address; delivery refused.`;
  } catch {
    return `Could not resolve ${host}.`;
  }
  return null;
}

type HookDoc = FirebaseFirestore.DocumentSnapshot;

async function deliverTo(ctx: PlannerContext, hooks: HookDoc[], event: WebhookEvent, data: Record<string, unknown>) {
  return Promise.all(
    hooks.map(async (hook) => {
      const deliveryId = randomUUID();
      const body = JSON.stringify({ id: deliveryId, type: event, createdAt: new Date().toISOString(), tenantId: ctx.tenantId, data });
      const startedAt = Date.now();
      const url = String(hook.get("url"));
      let outcome: ReturnType<typeof classifyDelivery>;
      const refused = await checkHost(url);
      if (refused) {
        outcome = classifyDelivery({ error: refused });
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), webhookTransport.timeoutMs);
        try {
          const response = await webhookTransport.fetch(url, {
            method: "POST",
            redirect: "manual",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "SaaSassin-Planner-Webhooks/1.0",
              "X-SaaSassin-Event": event,
              "X-SaaSassin-Delivery": deliveryId,
              [SIGNATURE_HEADER]: signatureHeader(String(hook.get("secret")), Math.floor(Date.now() / 1000), body),
            },
            body,
          });
          outcome = classifyDelivery({ httpStatus: response.status });
        } catch (cause) {
          outcome = classifyDelivery({ error: controller.signal.aborted ? `No response within ${webhookTransport.timeoutMs / 1000}s.` : `Could not connect: ${(cause as Error).message}`.slice(0, 200) });
        } finally {
          clearTimeout(timer);
        }
      }
      const record = {
        webhookId: hook.id,
        deliveryId,
        event,
        status: outcome.status,
        httpStatus: outcome.httpStatus,
        error: outcome.status === "failed" ? outcome.error : null,
        durationMs: Date.now() - startedAt,
        attemptedAt: FieldValue.serverTimestamp(),
      };
      await col(ctx.tenantId, "webhookDeliveries").doc(deliveryId).set(record);
      return { id: deliveryId, ...record, attemptedAt: null };
    }),
  );
}

/** Delivers an event to every subscribed endpoint. Never throws: failures are logged as failed deliveries. */
export async function dispatchWebhookEvent(ctx: PlannerContext, event: (typeof WEBHOOK_EVENTS)[number], data: Record<string, unknown>) {
  try {
    const hooks = await col(ctx.tenantId, "webhooks").where("events", "array-contains", event).get();
    if (hooks.empty) return [];
    return await deliverTo(ctx, hooks.docs, event, data);
  } catch (error) {
    console.error("Planner webhook dispatch failed", error);
    return [];
  }
}
