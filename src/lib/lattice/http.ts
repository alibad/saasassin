import "server-only";

import { ZodError } from "zod";

import { LatticeAuthError } from "@/lib/lattice/auth";
import { LatticeDataError } from "@/lib/lattice/data";

export function latticeApiError(error: unknown) {
  if (error instanceof LatticeAuthError || error instanceof LatticeDataError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: error.issues[0]?.message ?? "Check the submitted fields." },
      { status: 400 },
    );
  }
  console.error("Lattice API request failed", error);
  return Response.json({ error: "The request could not be completed." }, { status: 500 });
}
