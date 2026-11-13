import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Invitation link tokens: `<invitationId>.<secret>`. Only the SHA-256 of the secret is
 * stored, so a database read never yields a working link; resending rotates the secret,
 * which invalidates every earlier link. Kept free of "server-only" so unit tests can import it.
 */

export const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function createInviteSecret() {
  return randomBytes(32).toString("base64url");
}

export function hashInviteSecret(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function formatInviteToken(invitationId: string, secret: string) {
  return `${invitationId}.${secret}`;
}

/** Splits a link token; anything malformed (or URL-decoded junk) returns null. */
export function parseInviteToken(token: string | null | undefined) {
  if (!token || typeof token !== "string") return null;
  let decoded = token.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return null;
  }
  const dot = decoded.indexOf(".");
  if (dot <= 0) return null;
  const invitationId = decoded.slice(0, dot);
  const secret = decoded.slice(dot + 1);
  if (!ID_PATTERN.test(invitationId) || !SECRET_PATTERN.test(secret)) return null;
  return { invitationId, secret };
}

/** Constant-time comparison of a presented secret against the stored hash. */
export function verifyInviteSecret(secret: string, storedHash: string | null | undefined) {
  if (!storedHash || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
  const presented = Buffer.from(hashInviteSecret(secret), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

/** Lookup key for invitations addressed to an email (the email itself never becomes a path). */
export function inviteEmailKey(normalizedEmail: string) {
  return createHash("sha256").update(normalizedEmail, "utf8").digest("hex");
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

/** A pending invitation past its expiry is reported as expired without needing a write. */
export function effectiveInvitationStatus(status: string, expiresAtMs: number | null, nowMs = Date.now()): InvitationStatus {
  if (status === "accepted" || status === "revoked" || status === "expired") return status;
  if (expiresAtMs !== null && expiresAtMs <= nowMs) return "expired";
  return "pending";
}
