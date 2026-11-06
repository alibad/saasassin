/** Browser-safe webhook constants (the signing helpers in webhooks.ts need node:crypto). */
export const SIGNATURE_HEADER = "X-SaaSassin-Signature";
export const WEBHOOK_EVENTS = ["response.completed", "study.closed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  "response.completed": "A participant completes a study",
  "study.closed": "A study closes (manually or at its participant cap)",
};
