import { fleetApiError } from "@/lib/fleet/platform/http";
import { exportWorkspace, requireRevenueTenant } from "@/lib/revenue/data";
import { ADMIN_ROLES } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string }> };

/** Complete, versioned JSON export of the workspace (owner/admin only). */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    const payload = await exportWorkspace(ctx);
    const date = payload.manifest.exportedAt.slice(0, 10);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="saasassin-revenue-${tenantId}-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
