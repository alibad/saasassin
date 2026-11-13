import "server-only";

import { cookies } from "next/headers";

import { getAdminAuth } from "@/lib/firebase/admin";
import { getFleetApp } from "@/lib/fleet/apps";

export const FLEET_SESSION_MAX_AGE = 60 * 60 * 24 * 5;

/** Sensitive actions (ownership, admin rights) need a sign-in this recent. */
export const RECENT_AUTH_WINDOW_SECONDS = 10 * 60;

export type FleetUser = {
  uid: string;
  email: string;
  name: string;
  /** The sign-in provider's profile photo URL (the token's `picture` claim), if any. */
  picture?: string | null;
  emailVerified?: boolean;
  /** When the person last actually signed in (seconds since epoch), from the token's `auth_time`. */
  authTime?: number;
  /** firebase.sign_in_provider, e.g. "google.com" or "password". */
  signInProvider?: string | null;
};

export class FleetError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "FleetError";
    this.status = status;
    this.code = code;
  }
}

/** Host-only, product-specific session cookie. Signing into one product never authorizes another. */
export function fleetSessionCookie(product: string) {
  return `saasassin_${product}_session`;
}

export function assertFleetProduct(product: string) {
  const app = getFleetApp(product);
  // A generated single-product repository (STANDALONE_PRODUCT) serves sessions and tenants for its
  // own product only.
  const standalone = process.env.STANDALONE_PRODUCT;
  if (!app || app.slug === "performance" || (standalone && app.slug !== standalone)) {
    throw new FleetError("Unknown product.", 404);
  }
  return app;
}

type TokenClaims = {
  uid: string;
  email?: string;
  name?: unknown;
  picture?: unknown;
  email_verified?: unknown;
  auth_time?: unknown;
  firebase?: { sign_in_provider?: unknown };
};

/** Maps verified ID-token or session-cookie claims to the user the server acts for. */
export function fleetUserFromClaims(decoded: TokenClaims): FleetUser {
  const picture = typeof decoded.picture === "string" && /^https:\/\//.test(decoded.picture) ? decoded.picture : null;
  return {
    uid: decoded.uid,
    email: decoded.email ?? "",
    name: typeof decoded.name === "string" ? decoded.name : "",
    picture,
    emailVerified: decoded.email_verified === true,
    authTime: typeof decoded.auth_time === "number" ? decoded.auth_time : undefined,
    signInProvider: typeof decoded.firebase?.sign_in_provider === "string" ? decoded.firebase.sign_in_provider : null,
  };
}

/** Verifies (with revocation check) the session cookie with this name, if present. */
export async function readSessionCookieUser(cookieName: string): Promise<FleetUser | null> {
  const auth = getAdminAuth();
  if (!auth) return null;

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(cookieName)?.value;
  if (!sessionCookie) return null;

  try {
    return fleetUserFromClaims(await auth.verifySessionCookie(sessionCookie, true));
  } catch {
    return null;
  }
}

export async function getFleetUser(product: string): Promise<FleetUser | null> {
  // Keep the explicit await: Turbopack (Next 16.3) mis-infers `async f() { return g(); }` as
  // always resolving to a truthy value and compiles callers' `if (!user)` checks away.
  const user = await readSessionCookieUser(fleetSessionCookie(product));
  return user;
}

export async function requireFleetUser(product: string) {
  const user = await getFleetUser(product);
  if (!user) throw new FleetError("Sign in to continue.", 401);
  return user;
}

/** Throws a `reauth_required` error unless the person signed in within the recent-auth window. */
export function requireRecentAuth(user: FleetUser, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!user.authTime || nowSeconds - user.authTime > RECENT_AUTH_WINDOW_SECONDS) {
    throw new FleetError("For your security, confirm it's you to continue.", 403, "reauth_required");
  }
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}
