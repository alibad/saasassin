import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { buildWorkspaceExport, SLUG } from "@/lib/studies/data";

export async function GET(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId } = await context.params;
    const body = await buildWorkspaceExport(user, tenantId);
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="saasassin-studies-${tenantId}.json"`,
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
