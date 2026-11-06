import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed outbound webhooks for SaaSassin Revenue. Each delivery carries
 *   X-SaaSassin-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 * so receivers can verify authenticity and reject replays. Payloads never contain transcript text.
 */

export {
  DELIVERY_TIMEOUT_MS,
  MAX_WEBHOOKS,
  SIGNATURE_HEADER,
  TEST_EVENT,
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_EVENTS,
  type WebhookEvent,
} from "./webhook-events";

export function signPayload(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signatureHeader(secret: string, timestamp: number, body: string) {
  return `t=${timestamp},v1=${signPayload(secret, timestamp, body)}`;
}

/** Receiver-side check, documented for integrators and used by tests. */
export function verifySignature(secret: string, header: string, body: string, nowSeconds: number, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || !parts.v1 || !/^[0-9a-f]+$/i.test(parts.v1)) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(signPayload(secret, timestamp, body), "hex");
  const given = Buffer.from(parts.v1, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const PRIVATE_HOST = [/^localhost$/i, /\.localhost$/i, /\.local$/i, /\.internal$/i, /\.lan$/i, /\.home\.arpa$/i, /^metadata\.google\.internal$/i];

/** True for loopback, private, link-local, CGNAT, unspecified, multicast and IPv6 local ranges. */
export function isPrivateAddress(address: string) {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = mapped ? mapped[1] : ip;
  const octets = v4.split(".");
  if (octets.length === 4 && octets.every((part) => /^\d{1,3}$/.test(part))) {
    const [a, b] = octets.map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (ip.includes(":")) {
    return ip === "::" || ip === "::1" || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip);
  }
  return false;
}

/** Only public HTTPS endpoints; blocks internal names and literal private addresses (SSRF guard). */
export function validateWebhookUrl(raw: string): { ok: true; url: string; hostname: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "Enter a full URL starting with https://." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Webhook endpoints must use https://." };
  if (url.username || url.password) return { ok: false, reason: "Do not put credentials in the URL; verify the signature instead." };
  if (url.port && url.port !== "443") return { ok: false, reason: "Webhook endpoints must use the standard HTTPS port." };
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname.includes(".") && !hostname.includes(":")) return { ok: false, reason: "Use a public, fully qualified hostname." };
  if (PRIVATE_HOST.some((pattern) => pattern.test(hostname)) || isPrivateAddress(hostname)) {
    return { ok: false, reason: "Private or internal hosts cannot receive webhooks." };
  }
  return { ok: true, url: url.toString(), hostname };
}

export type DeliveryOutcome =
  | { status: "delivered"; httpStatus: number; error: null }
  | { status: "failed"; httpStatus: number | null; error: string };

/** Only a 2xx counts as delivered; redirects are not followed. */
export function classifyDelivery(result: { httpStatus?: number; error?: string }): DeliveryOutcome {
  if (result.error) return { status: "failed", httpStatus: result.httpStatus ?? null, error: result.error };
  const code = result.httpStatus ?? 0;
  if (code >= 200 && code < 300) return { status: "delivered", httpStatus: code, error: null };
  if (code >= 300 && code < 400) return { status: "failed", httpStatus: code, error: "Redirects are not followed; point the webhook at the final URL." };
  return { status: "failed", httpStatus: code, error: `Endpoint responded ${code}.` };
}

export function secretHint(secret: string) {
  return `whsec_…${secret.slice(-4)}`;
}
