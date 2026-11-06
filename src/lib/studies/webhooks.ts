import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed outbound webhooks (pure helpers). Every delivery carries
 *   X-SaaSassin-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 * so receivers can verify authenticity and reject replays outside a tolerance window.
 */

export { SIGNATURE_HEADER, WEBHOOK_EVENT_LABELS, WEBHOOK_EVENTS, type WebhookEvent } from "./webhook-events";

export function signPayload(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signatureHeader(secret: string, timestamp: number, body: string) {
  return `t=${timestamp},v1=${signPayload(secret, timestamp, body)}`;
}

/** Receiver-side verification (documented for integrators and used by tests). */
export function verifySignature(secret: string, header: string, body: string, nowSeconds: number, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || !parts.v1 || !/^[0-9a-f]+$/i.test(parts.v1)) return false;
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
  /\.lan$/i,
  /\.home\.arpa$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^0\./,
  /^\d+$/,
  /^0x[0-9a-f]+$/i,
  /^\[/,
  /^metadata\.google\.internal$/i,
];

/** Only public HTTPS endpoints; refuses loopback, private, link-local, IPv6 literals and bare-number hosts (SSRF guard). */
export function validateWebhookUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "Enter a full URL starting with https://." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Webhook endpoints must use https://." };
  if (url.username || url.password) return { ok: false, reason: "Do not put credentials in the URL; verify the signature instead." };
  if (url.port && url.port !== "443") return { ok: false, reason: "Webhook endpoints must use the standard HTTPS port." };
  if (!url.hostname.includes(".") || PRIVATE_HOST.some((pattern) => pattern.test(url.hostname))) {
    return { ok: false, reason: "Private or internal hosts cannot receive webhooks." };
  }
  return { ok: true, url: url.toString() };
}

export type DeliveryOutcome =
  | { status: "delivered"; httpStatus: number; error: null }
  | { status: "failed"; httpStatus: number | null; error: string };

/** Only a 2xx counts as delivered; redirects are never followed. */
export function classifyDelivery(result: { httpStatus?: number; error?: string }): DeliveryOutcome {
  if (result.error) return { status: "failed", httpStatus: result.httpStatus ?? null, error: result.error };
  const code = result.httpStatus ?? 0;
  if (code >= 200 && code < 300) return { status: "delivered", httpStatus: code, error: null };
  if (code >= 300 && code < 400) return { status: "failed", httpStatus: code, error: "Redirects are not followed; point the webhook at the final URL." };
  return { status: "failed", httpStatus: code, error: `Endpoint responded ${code}.` };
}

export function secretHint(secret: string) {
  return secret ? `whsec_…${secret.slice(-4)}` : "";
}
