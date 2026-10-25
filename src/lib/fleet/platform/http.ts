import "server-only";

import { ZodError } from "zod";

import { FleetError } from "./session";

export function fleetApiError(error: unknown) {
  if (error instanceof FleetError) {
    return Response.json({ error: error.message }, { status: error.status });
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
