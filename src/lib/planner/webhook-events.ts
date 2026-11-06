/** Client-safe webhook constants (no node:crypto), shared by the UI and the server. */
export const SIGNATURE_HEADER = "X-SaaSassin-Signature";
export const WEBHOOK_EVENTS = ["plan.applied", "task.at_risk"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number] | "webhook.test";
