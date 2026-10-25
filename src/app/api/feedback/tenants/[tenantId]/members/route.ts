import { PRODUCT } from "@/lib/feedback/data";
import { requireTeam } from "@/lib/feedback/http";
import { inviteSchema } from "@/lib/feedback/schemas";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { addTenantMember } from "@/lib/fleet/platform/tenants";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const { user } = await requireTeam(tenantId);
    const input = inviteSchema.parse(await request.json());
    // addTenantMember re-checks the owner/admin role and writes the audit event.
    return Response.json({ member: await addTenantMember(PRODUCT, tenantId, user, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
