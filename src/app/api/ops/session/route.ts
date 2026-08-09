import { NextResponse } from "next/server";

import {
  createOpsSessionValue,
  OPS_COOKIE_MAX_AGE,
  OPS_COOKIE_NAME,
  verifyOpsAccessKey,
} from "@/lib/ops-auth";

type AttemptWindow = { count: number; resetAt: number };

const attempts = new Map<string, AttemptWindow>();
const attemptWindowMs = 15 * 60 * 1000;
const maximumAttempts = 8;

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const key = clientKey(request);
  const now = Date.now();
  const previous = attempts.get(key);

  if (previous && previous.resetAt > now && previous.count >= maximumAttempts) {
    return NextResponse.json(
      { error: "Too many attempts." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  let accessKey: unknown;
  try {
    ({ accessKey } = (await request.json()) as { accessKey?: unknown });
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!verifyOpsAccessKey(accessKey)) {
    attempts.set(key, {
      count: previous && previous.resetAt > now ? previous.count + 1 : 1,
      resetAt: previous && previous.resetAt > now ? previous.resetAt : now + attemptWindowMs,
    });
    return NextResponse.json(
      { error: "Access denied." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  attempts.delete(key);
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set({
    name: OPS_COOKIE_NAME,
    value: createOpsSessionValue(),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: OPS_COOKIE_MAX_AGE,
    path: "/",
  });
  return response;
}
