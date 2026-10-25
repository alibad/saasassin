import "server-only";

import { cookies } from "next/headers";

import { getAdminAuth } from "@/lib/firebase/admin";

export const LATTICE_SESSION_COOKIE = "saasassin_lattice_session";
export const LATTICE_SESSION_MAX_AGE = 60 * 60 * 24 * 5;

export type SessionUser = {
  uid: string;
  email: string;
  name: string;
};

export class LatticeAuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "LatticeAuthError";
    this.status = status;
  }
}

export async function getCurrentSessionUser(): Promise<SessionUser | null> {
  const auth = getAdminAuth();
  if (!auth) {
    return null;
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(LATTICE_SESSION_COOKIE)?.value;
  if (!sessionCookie) {
    return null;
  }

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

export async function requireSessionUser() {
  const user = await getCurrentSessionUser();
  if (!user) {
    throw new LatticeAuthError("Sign in to continue.");
  }
  return user;
}
