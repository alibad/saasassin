import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";

import type { SessionUser } from "@/lib/lattice/auth";
import { auditRecord, authorizeOrganization, LatticeDataError, requireDb, toIso } from "@/lib/lattice/data";
import {
  generateApiKey,
  generateWebhookSecret,
  hashesMatch,
  hashSecret,
  parseApiKey,
  signWebhookPayload,
  validateWebhookUrl,
  type ApiScope,
  type WebhookEvent,
} from "@/lib/lattice/integrations";

const DELIVERY_TIMEOUT_MS = 5000;

export type IntegrationsSnapshot = {
  apiKeys: Array<{ id: string; name: string; preview: string; scopes: ApiScope[]; createdAt: string | null; lastUsedAt: string | null; revokedAt: string | null }>;
  webhooks: Array<{
    id: string;
    url: string;
    events: WebhookEvent[];
    active: boolean;
    createdAt: string | null;
    deliveries: Array<{ id: string; event: string; status: "delivered" | "failed"; httpStatus: number | null; error: string; attemptedAt: string | null; durationMs: number }>;
  }>;
};

function orgRef(db: Firestore, organizationId: string) {
  return db.collection("organizations").doc(organizationId);
}

export async function createApiKey(input: { actor: SessionUser; organizationId: string; name: string; scopes: ApiScope[] }) {
  const { actor, organizationId } = input;
  const { db, member } = await authorizeOrganization(actor, organizationId, "organization.manage");
  const base = orgRef(db, organizationId);
  const keyRef = base.collection("apiKeys").doc();
  const key = generateApiKey(organizationId, keyRef.id);
  const batch = db.batch();
  batch.set(keyRef, {
    name: input.name.trim(),
    hash: key.hash,
    preview: key.preview,
    scopes: input.scopes,
    createdBy: member.id,
    createdAt: FieldValue.serverTimestamp(),
    lastUsedAt: null,
    revokedAt: null,
  });
  batch.set(base.collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: "api_key.created",
    entityType: "api_key",
    entityId: keyRef.id,
    summary: `Created API key ${input.name.trim()} (${input.scopes.join(", ")}).`,
    metadata: { scopes: input.scopes },
  }));
  await batch.commit();
  // The plaintext key is returned exactly once and never stored.
  return { id: keyRef.id, key: key.plaintext };
}

export async function revokeApiKey(input: { actor: SessionUser; organizationId: string; keyId: string }) {
  const { actor, organizationId, keyId } = input;
  const { db } = await authorizeOrganization(actor, organizationId, "organization.manage");
  const base = orgRef(db, organizationId);
  const keyRef = base.collection("apiKeys").doc(keyId);
  const key = await keyRef.get();
  if (!key.exists) throw new LatticeDataError("API key not found.", 404);
  if (key.data()?.revokedAt) return;
  const batch = db.batch();
  batch.update(keyRef, { revokedAt: FieldValue.serverTimestamp() });
  batch.set(base.collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: "api_key.revoked",
    entityType: "api_key",
    entityId: keyId,
    summary: `Revoked API key ${String(key.data()?.name ?? "")}.`,
  }));
  await batch.commit();
}

/** Resolves a Bearer API key to its organization, enforcing hash, revocation and scope. */
export async function authenticateApiKey(authorization: string | null, organizationId: string, scope: ApiScope) {
  const parsed = parseApiKey(authorization);
  if (!parsed) throw new LatticeDataError("Provide an API key as a Bearer token.", 401);
  if (parsed.organizationId !== organizationId) throw new LatticeDataError("This API key belongs to another workspace.", 403);
  const db = requireDb();
  const keyRef = orgRef(db, organizationId).collection("apiKeys").doc(parsed.keyId);
  const key = await keyRef.get();
  const data = key.data();
  if (!data || !hashesMatch(String(data.hash ?? ""), hashSecret(parsed.token))) {
    throw new LatticeDataError("Invalid API key.", 401);
  }
  if (data.revokedAt) throw new LatticeDataError("This API key has been revoked.", 401);
  if (!Array.isArray(data.scopes) || !data.scopes.includes(scope)) {
    throw new LatticeDataError(`This API key lacks the ${scope} scope.`, 403);
  }
  await keyRef.update({ lastUsedAt: FieldValue.serverTimestamp() });
  return { db, keyId: parsed.keyId };
}

/** Read-only REST resources. Sensitive review content is never exposed. */
export async function readApiResource(db: Firestore, organizationId: string, resource: "members" | "cycles" | "goals") {
  const base = orgRef(db, organizationId);
  if (resource === "members") {
    const members = await base.collection("members").get();
    return members.docs.map((document) => {
      const data = document.data();
      return { id: document.id, name: data.name ?? null, email: data.email ?? null, title: data.title ?? null, teamId: data.teamId ?? null, teamName: data.teamName ?? null, managerId: data.managerId ?? null, status: data.status ?? null };
    });
  }
  if (resource === "cycles") {
    const cycles = await base.collection("reviewCycles").get();
    return Promise.all(cycles.docs.map(async (document) => {
      const data = document.data();
      const reviews = await document.ref.collection("reviews").get();
      return {
        id: document.id,
        name: data.name ?? null,
        state: data.state ?? null,
        dueDate: data.dueDate ?? null,
        assignedReviews: reviews.size,
        submittedReviews: reviews.docs.filter((review) => review.data().state === "submitted").length,
      };
    }));
  }
  const goals = await base.collection("goals").where("visibility", "==", "public").get();
  return goals.docs.map((document) => {
    const data = document.data();
    return { id: document.id, ownerId: data.ownerId ?? null, title: data.title ?? null, progress: data.progress ?? 0, status: data.status ?? null, dueDate: data.dueDate ?? null };
  });
}

export async function createWebhook(input: { actor: SessionUser; organizationId: string; url: string; events: WebhookEvent[] }) {
  const { actor, organizationId } = input;
  const { db, member } = await authorizeOrganization(actor, organizationId, "organization.manage");
  const urlError = validateWebhookUrl(input.url);
  if (urlError) throw new LatticeDataError(urlError);
  const base = orgRef(db, organizationId);
  const hookRef = base.collection("webhooks").doc();
  const secret = generateWebhookSecret();
  const batch = db.batch();
  batch.set(hookRef, {
    url: input.url,
    events: input.events,
    // The signing secret must be readable by the server to sign deliveries; the
    // collection is server-only (Firestore rules deny all client access).
    secret,
    active: true,
    createdBy: member.id,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(base.collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: "webhook.created",
    entityType: "webhook",
    entityId: hookRef.id,
    summary: `Created a webhook to ${new URL(input.url).host} for ${input.events.join(", ")}.`,
  }));
  await batch.commit();
  return { id: hookRef.id, secret };
}

export async function setWebhookActive(input: { actor: SessionUser; organizationId: string; webhookId: string; active: boolean }) {
  const { actor, organizationId, webhookId, active } = input;
  const { db } = await authorizeOrganization(actor, organizationId, "organization.manage");
  const base = orgRef(db, organizationId);
  const hookRef = base.collection("webhooks").doc(webhookId);
  if (!(await hookRef.get()).exists) throw new LatticeDataError("Webhook not found.", 404);
  const batch = db.batch();
  batch.update(hookRef, { active });
  batch.set(base.collection("auditEvents").doc(), auditRecord({
    actor,
    eventType: active ? "webhook.enabled" : "webhook.disabled",
    entityType: "webhook",
    entityId: webhookId,
    summary: `${active ? "Enabled" : "Disabled"} a webhook.`,
  }));
  await batch.commit();
}

/**
 * Delivers an event to every active subscription, signing each request and
 * recording an honest delivery log (HTTP status, error, duration). Failures never
 * break the action that emitted the event.
 */
export async function dispatchWebhookEvent(
  organizationId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  onlyWebhookId?: string,
) {
  const db = requireDb();
  const hooks = await orgRef(db, organizationId).collection("webhooks").where("active", "==", true).get();
  const targets = hooks.docs.filter((hook) =>
    (onlyWebhookId ? hook.id === onlyWebhookId : true)
    && Array.isArray(hook.data().events)
    && (hook.data().events.includes(event) || event === "webhook.test"),
  );
  const results = await Promise.all(targets.map(async (hook) => {
    const deliveryRef = hook.ref.collection("deliveries").doc();
    const body = JSON.stringify({ id: deliveryRef.id, event, organizationId, occurredAt: new Date().toISOString(), data });
    const timestamp = Math.floor(Date.now() / 1000);
    const started = Date.now();
    let httpStatus: number | null = null;
    let error = "";
    try {
      const response = await fetch(String(hook.data().url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "SaaSassin-Performance-Webhooks/1.0",
          "X-SaaSassin-Event": event,
          "X-SaaSassin-Delivery": deliveryRef.id,
          "X-SaaSassin-Signature": signWebhookPayload(String(hook.data().secret), body, timestamp),
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      httpStatus = response.status;
      if (!response.ok) error = `Endpoint responded with HTTP ${response.status}.`;
    } catch (caught) {
      error = caught instanceof Error ? `${caught.name}: ${caught.message}` : "Delivery failed.";
    }
    const status = !error && httpStatus !== null && httpStatus < 300 ? "delivered" : "failed";
    await deliveryRef.set({
      event,
      status,
      httpStatus,
      error: error.slice(0, 300),
      durationMs: Date.now() - started,
      attemptedAt: FieldValue.serverTimestamp(),
    });
    return { webhookId: hook.id, status, httpStatus, error };
  }));
  return results;
}

export async function testWebhook(input: { actor: SessionUser; organizationId: string; webhookId: string }) {
  await authorizeOrganization(input.actor, input.organizationId, "organization.manage");
  const [result] = await dispatchWebhookEvent(input.organizationId, "webhook.test", { message: "Test delivery from SaaSassin Performance." }, input.webhookId);
  if (!result) throw new LatticeDataError("Enable the webhook before sending a test.", 409);
  return result;
}

export async function getIntegrationsSnapshot(actor: SessionUser, organizationId: string): Promise<IntegrationsSnapshot | null> {
  try {
    const { db } = await authorizeOrganization(actor, organizationId, "organization.manage");
    const base = orgRef(db, organizationId);
    const [keys, hooks] = await Promise.all([base.collection("apiKeys").get(), base.collection("webhooks").get()]);
    const webhooks = await Promise.all(hooks.docs.map(async (hook) => {
      const deliveries = await hook.ref.collection("deliveries").orderBy("attemptedAt", "desc").limit(10).get();
      return {
        id: hook.id,
        url: String(hook.data().url ?? ""),
        events: (hook.data().events ?? []) as WebhookEvent[],
        active: Boolean(hook.data().active),
        createdAt: toIso(hook.data().createdAt),
        deliveries: deliveries.docs.map((delivery) => ({
          id: delivery.id,
          event: String(delivery.data().event ?? ""),
          status: (delivery.data().status === "delivered" ? "delivered" : "failed") as "delivered" | "failed",
          httpStatus: typeof delivery.data().httpStatus === "number" ? delivery.data().httpStatus : null,
          error: String(delivery.data().error ?? ""),
          attemptedAt: toIso(delivery.data().attemptedAt),
          durationMs: Number(delivery.data().durationMs ?? 0),
        })),
      };
    }));
    return {
      apiKeys: keys.docs.map((key) => ({
        id: key.id,
        name: String(key.data().name ?? ""),
        preview: String(key.data().preview ?? ""),
        scopes: (key.data().scopes ?? []) as ApiScope[],
        createdAt: toIso(key.data().createdAt),
        lastUsedAt: toIso(key.data().lastUsedAt),
        revokedAt: toIso(key.data().revokedAt),
      })),
      webhooks,
    };
  } catch {
    return null;
  }
}
