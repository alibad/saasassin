import "server-only";

import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";

import { tenantCollection } from "@/lib/fleet/platform/tenants";

import { REVENUE_SLUG as SLUG } from "./schemas";
import { classifyDelivery, DELIVERY_TIMEOUT_MS, isPrivateAddress, SIGNATURE_HEADER, signatureHeader, validateWebhookUrl, type DeliveryOutcome } from "./webhooks";

export type Fetcher = (url: string, init: RequestInit) => Promise<{ status: number }>;
export type Resolver = (hostname: string) => Promise<string[]>;

/** Injected in tests; production uses fetch and the system resolver. */
export type DeliveryOptions = { fetcher?: Fetcher; resolve?: Resolver };

const systemResolve: Resolver = async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

export type DeliveryRecord = {
  id: string;
  webhookId: string;
  url: string;
  event: string;
  eventId: string;
  durationMs: number;
  attemptedAt: string;
} & DeliveryOutcome;

/** Resolves the host at delivery time too, so DNS that points at an internal address is refused. */
async function guardHost(url: string, resolve: Resolver): Promise<string | null> {
  const check = validateWebhookUrl(url);
  if (!check.ok) return check.reason;
  try {
    const addresses = await resolve(check.hostname);
    if (!addresses.length) return "The host did not resolve.";
    if (addresses.some(isPrivateAddress)) return "Refused: the host resolves to a private or internal address.";
    return null;
  } catch {
    return "The host did not resolve.";
  }
}

/**
 * Sends a signed event to every active webhook subscribed to it (or only `onlyWebhookId`) and records
 * each attempt in the delivery log. Never throws: a failing endpoint must not break the mutation.
 */
export async function dispatchWebhooks(
  tenantId: string,
  event: string,
  payload: Record<string, unknown>,
  options: DeliveryOptions & { onlyWebhookId?: string } = {},
): Promise<DeliveryRecord[]> {
  const fetcher = options.fetcher ?? (fetch as Fetcher);
  const resolve = options.resolve ?? systemResolve;
  const hooks = tenantCollection(SLUG, tenantId, "webhooks");
  const deliveries = tenantCollection(SLUG, tenantId, "webhookDeliveries");
  try {
    const targets = options.onlyWebhookId
      ? [await hooks.doc(options.onlyWebhookId).get()].filter((doc) => doc.exists)
      : (await hooks.where("active", "==", true).get()).docs.filter((doc) => ((doc.get("events") ?? []) as string[]).includes(event));
    return await Promise.all(
      targets.map(async (doc) => {
        const url = String(doc.get("url"));
        const eventId = `evt_${randomBytes(12).toString("hex")}`;
        const body = JSON.stringify({ id: eventId, type: event, product: SLUG, tenantId, createdAt: new Date().toISOString(), data: payload });
        const started = Date.now();
        let result: { httpStatus?: number; error?: string };
        const refused = await guardHost(url, resolve);
        if (refused) {
          result = { error: refused };
        } else {
          try {
            const timestamp = Math.floor(Date.now() / 1000);
            const response = await fetcher(url, {
              method: "POST",
              redirect: "manual",
              signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
              headers: {
                "Content-Type": "application/json",
                "User-Agent": "SaaSassin-Revenue-Webhooks/1",
                [SIGNATURE_HEADER]: signatureHeader(String(doc.get("secret")), timestamp, body),
              },
              body,
            });
            result = { httpStatus: response.status };
          } catch (error) {
            const name = (error as Error).name;
            result = { error: name === "TimeoutError" || name === "AbortError" ? `Timed out after ${DELIVERY_TIMEOUT_MS / 1000}s.` : `Network error: ${(error as Error).message}` };
          }
        }
        const ref = deliveries.doc();
        const record: DeliveryRecord = {
          id: ref.id,
          webhookId: doc.id,
          url,
          event,
          eventId,
          ...classifyDelivery(result),
          durationMs: Date.now() - started,
          attemptedAt: new Date().toISOString(),
        };
        await ref.set(record);
        return record;
      }),
    );
  } catch (error) {
    console.error("Revenue webhook dispatch failed", error);
    return [];
  }
}
