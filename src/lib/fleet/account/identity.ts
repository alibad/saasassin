/**
 * Small, pure identity helpers shared by the browser and the server: email normalisation,
 * safe post-sign-in redirects, avatar image checks and initials.
 */

/** Emails are compared and stored lowercased and trimmed. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** "jane.doe@acme.com" -> "j•••@acme.com", for showing who an invitation is for. */
export function maskEmail(email: string) {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = normalized.slice(0, at);
  return `${local.charAt(0)}•••${normalized.slice(at)}`;
}

/**
 * Where to go after signing in. Only same-origin relative paths are allowed ("/apps/x/team"),
 * never "//evil.com", "/\\evil.com", "https://…", "javascript:…" or anything with control
 * characters; anything else falls back.
 */
export function sanitizeNextPath(value: string | null | undefined, fallback: string) {
  if (!value || typeof value !== "string") return fallback;
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  try {
    const base = "https://next.invalid";
    const url = new URL(candidate, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export const MAX_AVATAR_BYTES = 256 * 1024;
export const AVATAR_SIZE = 256;

export type AvatarImageType = "image/png" | "image/jpeg" | "image/webp";

/**
 * Identifies an uploaded avatar by its magic bytes. Only PNG, JPEG and WebP are accepted;
 * SVG (which can carry script), GIF and everything else return null. The declared
 * Content-Type is never trusted.
 */
export function detectAvatarImageType(bytes: Uint8Array): AvatarImageType | null {
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

export type AvatarCheck =
  | { ok: true; contentType: AvatarImageType }
  | { ok: false; message: string };

export function checkAvatarBytes(bytes: Uint8Array): AvatarCheck {
  if (bytes.length === 0) return { ok: false, message: "Choose an image to upload." };
  if (bytes.length > MAX_AVATAR_BYTES) return { ok: false, message: "That image is too large. Photos must be 256 KB or smaller." };
  const contentType = detectAvatarImageType(bytes);
  if (!contentType) return { ok: false, message: "Use a PNG, JPEG or WebP image." };
  return { ok: true, contentType };
}

/** Up to two initials from a name, else the first letter of the email, else "?". */
export function initialsFor(name: string | null | undefined, email?: string | null) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${firstLetter(words[0])}${firstLetter(words[words.length - 1])}`.toUpperCase();
  if (words.length === 1) return firstLetter(words[0]).toUpperCase();
  const local = (email ?? "").trim();
  return local ? firstLetter(local).toUpperCase() : "?";
}

function firstLetter(word: string) {
  return Array.from(word)[0] ?? "";
}

/**
 * A stable small integer per person, used to vary the initials tint around the brand's
 * primary colour so neighbouring avatars are distinguishable.
 */
export function avatarTintIndex(seed: string, buckets = 6) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % buckets;
}

export type AuthProviderId = "google" | "microsoft" | "github" | "apple";

const OPTIONAL_PROVIDERS: AuthProviderId[] = ["microsoft", "github", "apple"];

/**
 * Sign-in providers switched on for this deployment, from NEXT_PUBLIC_FLEET_AUTH_PROVIDERS
 * (a comma list). Google is always on; unknown names are ignored.
 */
export function parseAuthProviders(value: string | null | undefined): AuthProviderId[] {
  const listed = new Set((value ?? "").split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean));
  return ["google", ...OPTIONAL_PROVIDERS.filter((provider) => listed.has(provider))];
}

export const FIREBASE_PROVIDER_IDS: Record<AuthProviderId, string> = {
  google: "google.com",
  microsoft: "microsoft.com",
  github: "github.com",
  apple: "apple.com",
};

export const PROVIDER_LABELS: Record<AuthProviderId | "password", string> = {
  google: "Google",
  microsoft: "Microsoft",
  github: "GitHub",
  apple: "Apple",
  password: "Email and password",
};

export function providerFromFirebaseId(providerId: string): AuthProviderId | "password" | null {
  if (providerId === "password") return "password";
  const match = (Object.entries(FIREBASE_PROVIDER_IDS) as Array<[AuthProviderId, string]>)
    .find(([, firebaseId]) => firebaseId === providerId);
  return match ? match[0] : null;
}
