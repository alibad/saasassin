/** Client-safe webhook constants (the signing code in webhooks.ts is server-only). */

export const SIGNATURE_HEADER = "X-SaaSassin-Signature";
export const WEBHOOK_EVENTS = ["call.analyzed", "deal.stage_changed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const TEST_EVENT = "webhook.test";

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "call.analyzed": "A call was logged, re-analyzed or redacted (analysis summary, no transcript text)",
  "deal.stage_changed": "A deal moved stage (from, to, who, amount)",
};

export const MAX_WEBHOOKS = 10;
export const DELIVERY_TIMEOUT_MS = 5000;
