import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { addTenantMember, listTenantMembers, requireTenantMember } from "@/lib/fleet/platform/tenants";
import { CREATOR_SLUG, memberInviteSchema } from "@/lib/creator/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user);
    const members = await listTenantMembers(CREATOR_SLUG, tenantId);
    return Response.json({ members: members.filter((member) => member.status === "active") });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    const input = memberInviteSchema.parse(await request.json());
    // addTenantMember re-checks the privileged role and writes the audit event.
    return Response.json({ member: await addTenantMember(CREATOR_SLUG, tenantId, user, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
