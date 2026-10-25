/** Client-safe webhook constants (no Node crypto). */
export const WEBHOOK_EVENTS = ["post.created", "status.changed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const SIGNATURE_HEADER = "X-SaaSassin-Signature";
