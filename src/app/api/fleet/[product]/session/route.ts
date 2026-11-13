import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminAuth } from "@/lib/firebase/admin";
import { assertSameOrigin, fleetApiError, readJson } from "@/lib/fleet/platform/http";
import { syncProfileFromSession } from "@/lib/fleet/platform/profiles";
import {
  assertFleetProduct,
  FLEET_SESSION_MAX_AGE,
  fleetSessionCookie,
  fleetUserFromClaims,
  sessionCookieOptions,
} from "@/lib/fleet/platform/session";

const sessionSchema = z.object({
  idToken: z.string().min(20),
});

type RouteContext = { params: Promise<{ product: string }> };

/**
 * Exchanges a fresh Firebase ID token for this product's session cookie. Also called again
 * after re-authentication, so sensitive actions see a recent sign-in, and after security
 * changes (password, two-step verification) that revoke older sessions.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product } = await params;
    assertFleetProduct(product);
    const { idToken } = sessionSchema.parse(await readJson(request));
    const auth = getAdminAuth();
    if (!auth) {
      return Response.json({ error: "Firebase Authentication is not configured." }, { status: 503 });
    }
    const decoded = await auth.verifyIdToken(idToken, true);
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: FLEET_SESSION_MAX_AGE * 1000,
    });
    // Keep the provider photo URL and email on the product profile current. A failure here
    // must not block signing in.
    await syncProfileFromSession(product, fleetUserFromClaims(decoded))
      .catch((error) => console.error("Profile sync failed", error));
    const response = NextResponse.json({ ok: true });
    response.cookies.set(fleetSessionCookie(product), sessionCookie, sessionCookieOptions(FLEET_SESSION_MAX_AGE));
    return response;
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product } = await params;
    assertFleetProduct(product);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(fleetSessionCookie(product), "", sessionCookieOptions(0));
    return response;
  } catch (error) {
    return fleetApiError(error);
  }
}
