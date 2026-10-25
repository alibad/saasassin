import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pure integration primitives: API key format and hashing, webhook URL policy,
 * and HMAC-SHA256 webhook signatures. Keys and webhook secrets are shown once;
 * keys are stored only as SHA-256 hashes.
 */

export const API_SCOPES = ["directory:read", "cycles:read", "goals:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const WEBHOOK_EVENTS = [
  "review_cycle.transitioned",
  "review_packet.acknowledged",
  "webhook.test",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const KEY_PREFIX = "sk_perf";

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Key format: sk_perf.<organizationId>.<keyId>.<secret> */
export function generateApiKey(organizationId: string, keyId: string) {
  const secret = randomBytes(24).toString("base64url");
  const plaintext = `${KEY_PREFIX}.${organizationId}.${keyId}.${secret}`;
  return { plaintext, hash: hashSecret(plaintext), preview: `${KEY_PREFIX}.…${secret.slice(-4)}` };
}

export function parseApiKey(authorization: string | null) {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const [prefix, organizationId, keyId, secret, ...rest] = token.split(".");
  if (prefix !== KEY_PREFIX || !organizationId || !keyId || !secret || rest.length) return null;
  return { token, organizationId, keyId };
}

export function hashesMatch(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export function generateWebhookSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

/** Only public HTTPS endpoints; blocks obvious loopback/private targets (SSRF). */
export function validateWebhookUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Enter a valid URL.";
  }
  if (url.protocol !== "https:") return "Webhook URLs must use HTTPS.";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost"
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host.endsWith(".internal")
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /^169\.254\./.test(host)
    || /^0\./.test(host)
    || host === "::1"
    || /^f[cd][0-9a-f]{2}:/.test(host)
    || /^fe80:/.test(host)
  ) {
    return "Webhook URLs must point to a public host.";
  }
  return null;
}

/** Stripe-style signature header: t=<unix seconds>,v1=<hex hmac of "t.body"> */
export function signWebhookPayload(secret: string, body: string, timestamp: number) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export function verifyWebhookSignature(input: {
  secret: string;
  body: string;
  header: string;
  now: number;
  toleranceSeconds?: number;
}) {
  const parts = Object.fromEntries(input.header.split(",").map((part) => part.split("=") as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || !parts.v1) return false;
  if (Math.abs(input.now - timestamp) > (input.toleranceSeconds ?? 300)) return false;
  const expected = signWebhookPayload(input.secret, input.body, timestamp).split("v1=")[1];
  return hashesMatch(expected, parts.v1);
}
