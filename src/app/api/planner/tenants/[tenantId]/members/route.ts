import { fleetApiError } from "@/lib/fleet/platform/http";
import { addTenantMember, PRIVILEGED_ROLES } from "@/lib/fleet/platform/tenants";
import { plannerContext, readMembers } from "@/lib/planner/data";
import { inviteSchema, PLANNER_SLUG } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    await plannerContext(tenantId);
    return Response.json({ members: await readMembers(tenantId) });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const ctx = await plannerContext(tenantId, PRIVILEGED_ROLES);
    const input = inviteSchema.parse(await request.json());
    const member = await addTenantMember(PLANNER_SLUG, tenantId, ctx.user, input);
    return Response.json({ member }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
