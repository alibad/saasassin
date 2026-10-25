import { loadAdminSnapshot } from "@/lib/feedback/data";
import { requireTeam } from "@/lib/feedback/http";
import { fleetApiError } from "@/lib/fleet/platform/http";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const { user, role, tenant } = await requireTeam(tenantId);
    const snapshot = await loadAdminSnapshot(tenantId);
    return Response.json({ tenant: { id: tenant.id, name: tenant.name }, role, me: { uid: user.uid, email: user.email }, ...snapshot });
  } catch (error) {
    return fleetApiError(error);
  }
}
