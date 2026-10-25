import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed outbound webhooks. Each delivery carries
 *   X-SaaSassin-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 * (the same scheme Stripe popularised), so receivers can verify authenticity and reject replays.
 */

export { SIGNATURE_HEADER, WEBHOOK_EVENTS, type WebhookEvent } from "./webhook-events";

export function signPayload(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signatureHeader(secret: string, timestamp: number, body: string) {
  return `t=${timestamp},v1=${signPayload(secret, timestamp, body)}`;
}

/** Receiver-side check (documented for integrators, and used by tests). */
export function verifySignature(secret: string, header: string, body: string, nowSeconds: number, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || !parts.v1) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(signPayload(secret, timestamp, body), "hex");
  const given = Buffer.from(parts.v1, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const PRIVATE_HOST = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^metadata\.google\.internal$/i,
];

/** Only public HTTPS endpoints; blocks obvious internal targets (SSRF guard). */
export function validateWebhookUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Enter a full URL starting with https://." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Webhook endpoints must use https://." };
  if (url.username || url.password) return { ok: false, reason: "Do not put credentials in the URL; verify the signature instead." };
  if (PRIVATE_HOST.some((pattern) => pattern.test(url.hostname))) return { ok: false, reason: "Private or internal hosts cannot receive webhooks." };
  return { ok: true, url: url.toString() };
}

export type DeliveryOutcome =
  | { status: "delivered"; httpStatus: number }
  | { status: "failed"; httpStatus: number | null; error: string };

/** Classifies a delivery attempt honestly: only a 2xx counts as delivered. */
export function classifyDelivery(result: { httpStatus?: number; error?: string }): DeliveryOutcome {
  if (result.error) return { status: "failed", httpStatus: result.httpStatus ?? null, error: result.error };
  const code = result.httpStatus ?? 0;
  if (code >= 200 && code < 300) return { status: "delivered", httpStatus: code };
  if (code >= 300 && code < 400) return { status: "failed", httpStatus: code, error: "Redirects are not followed; point the webhook at the final URL." };
  return { status: "failed", httpStatus: code, error: `Endpoint responded ${code}.` };
}
