import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminAuth } from "@/lib/firebase/admin";
import {
  LATTICE_SESSION_COOKIE,
  LATTICE_SESSION_MAX_AGE,
} from "@/lib/lattice/auth";
import { latticeApiError } from "@/lib/lattice/http";

const sessionSchema = z.object({
  idToken: z.string().min(20),
});

export async function POST(request: Request) {
  try {
    const { idToken } = sessionSchema.parse(await request.json());
    const auth = getAdminAuth();
    if (!auth) {
      return Response.json({ error: "Firebase Authentication is not configured." }, { status: 503 });
    }
    await auth.verifyIdToken(idToken, true);
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: LATTICE_SESSION_MAX_AGE * 1000,
    });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(LATTICE_SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: LATTICE_SESSION_MAX_AGE,
      path: "/",
    });
    return response;
  } catch (error) {
    return latticeApiError(error);
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(LATTICE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
