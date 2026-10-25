import { latticeApiError } from "@/lib/lattice/http";
import type { ApiScope } from "@/lib/lattice/integrations";
import { authenticateApiKey, readApiResource } from "@/lib/lattice/integrations-data";

const RESOURCES = {
  members: "directory:read",
  cycles: "cycles:read",
  goals: "goals:read",
} as const satisfies Record<string, ApiScope>;

/** Read-only Performance REST API, authenticated by a scoped, revocable API key. */
export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string; resource: string }> },
) {
  try {
    const { organizationId, resource } = await context.params;
    if (!(resource in RESOURCES)) {
      return Response.json({ error: `Unknown resource. Use one of: ${Object.keys(RESOURCES).join(", ")}.` }, { status: 404 });
    }
    const name = resource as keyof typeof RESOURCES;
    const { db } = await authenticateApiKey(request.headers.get("authorization"), organizationId, RESOURCES[name]);
    const data = await readApiResource(db, organizationId, name);
    return Response.json({ object: "list", resource: name, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return latticeApiError(error);
  }
}
