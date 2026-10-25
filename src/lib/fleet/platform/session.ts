import "server-only";

import { cookies } from "next/headers";

import { getAdminAuth } from "@/lib/firebase/admin";
import { getFleetApp } from "@/lib/fleet/apps";

export const FLEET_SESSION_MAX_AGE = 60 * 60 * 24 * 5;

export type FleetUser = {
  uid: string;
  email: string;
  name: string;
};

export class FleetError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "FleetError";
    this.status = status;
  }
}

/** Host-only, product-specific session cookie. Signing into one product never authorizes another. */
export function fleetSessionCookie(product: string) {
  return `saasassin_${product}_session`;
}

export function assertFleetProduct(product: string) {
  const app = getFleetApp(product);
  if (!app || app.slug === "performance") {
    throw new FleetError("Unknown product.", 404);
  }
  return app;
}

export async function getFleetUser(product: string): Promise<FleetUser | null> {
  const auth = getAdminAuth();
  if (!auth) return null;

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(fleetSessionCookie(product))?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await auth.verifySessionCookie(sessionCookie, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? "",
      name: typeof decoded.name === "string" ? decoded.name : "",
    };
  } catch {
    return null;
  }
}

export async function requireFleetUser(product: string) {
  const user = await getFleetUser(product);
  if (!user) throw new FleetError("Sign in to continue.", 401);
  return user;
}
