import "server-only";

import { ZodError } from "zod";

import { FleetError } from "./session";

export function fleetApiError(error: unknown) {
  if (error instanceof FleetError) {
    return Response.json(
      error.code ? { error: error.message, code: error.code } : { error: error.message },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Check the submitted fields." },
      { status: 400 },
    );
  }
  console.error("Fleet API request failed", error);
  return Response.json({ error: "The request could not be completed." }, { status: 500 });
}

/**
 * Refuses state-changing requests sent by another site. Product hosts are sibling subdomains
 * (same-site), so SameSite=Lax cookies alone would not stop one product's page from posting
 * to another product's API. Browsers always send Origin on these requests; tools without one
 * still need a valid session cookie.
 */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new FleetError("Cross-site request refused.", 403);
  }
  const hosts = [new URL(request.url).host, request.headers.get("host"), request.headers.get("x-forwarded-host")];
  if (!hosts.some((host) => host && host === originHost)) {
    throw new FleetError("Cross-site request refused.", 403);
  }
}

/** Parses a JSON body, turning a malformed one into a readable 400. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new FleetError("Send a JSON request body.", 400);
  }
}
