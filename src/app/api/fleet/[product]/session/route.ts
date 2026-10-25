import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminAuth } from "@/lib/firebase/admin";
import { fleetApiError } from "@/lib/fleet/platform/http";
import {
  assertFleetProduct,
  FLEET_SESSION_MAX_AGE,
  fleetSessionCookie,
} from "@/lib/fleet/platform/session";

const sessionSchema = z.object({
  idToken: z.string().min(20),
});

type RouteContext = { params: Promise<{ product: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { product } = await params;
    assertFleetProduct(product);
    const { idToken } = sessionSchema.parse(await request.json());
    const auth = getAdminAuth();
    if (!auth) {
      return Response.json({ error: "Firebase Authentication is not configured." }, { status: 503 });
    }
    await auth.verifyIdToken(idToken, true);
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: FLEET_SESSION_MAX_AGE * 1000,
    });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(fleetSessionCookie(product), sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: FLEET_SESSION_MAX_AGE,
      path: "/",
    });
    return response;
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { product } = await params;
    assertFleetProduct(product);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(fleetSessionCookie(product), "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (error) {
    return fleetApiError(error);
  }
}
