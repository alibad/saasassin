import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const OPS_COOKIE_NAME = "saasassin_ops_session";
export const OPS_COOKIE_MAX_AGE = 60 * 60 * 8;

function opsSecret() {
  return process.env.OPS_ACCESS_KEY?.trim() ?? "";
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function safeEqual(left: string, right: string) {
  return timingSafeEqual(digest(left), digest(right));
}

export function verifyOpsAccessKey(candidate: unknown) {
  const secret = opsSecret();
  return typeof candidate === "string" && Boolean(secret) && safeEqual(candidate, secret);
}

function signOpsSession(payload: string) {
  const secret = opsSecret();
  if (!secret) return "";

  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

export function createOpsSessionValue(now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + OPS_COOKIE_MAX_AGE;
  const payload = `v1.${expiresAt}`;
  const signature = signOpsSession(payload);
  return signature ? `${payload}.${signature}` : "";
}

function verifyOpsSessionValue(session: string) {
  const [version, expiresAtText, signature, ...extra] = session.split(".");
  if (version !== "v1" || extra.length || !expiresAtText || !signature) return false;

  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = signOpsSession(`${version}.${expiresAtText}`);
  return Boolean(expected && safeEqual(signature, expected));
}

export async function isOpsAuthenticated() {
  const session = (await cookies()).get(OPS_COOKIE_NAME)?.value ?? "";
  return Boolean(session && verifyOpsSessionValue(session));
}
