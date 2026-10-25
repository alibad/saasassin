import { COMMUNITY_SLUG, memberInviteSchema } from "@/lib/community/model";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { addTenantMember, PRIVILEGED_ROLES, requireTenantMember } from "@/lib/fleet/platform/tenants";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Invite an existing SaaSassin account by email; addTenantMember re-checks the role and writes the audit event. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(COMMUNITY_SLUG);
    await requireTenantMember(COMMUNITY_SLUG, tenantId, user, PRIVILEGED_ROLES);
    const input = memberInviteSchema.parse(await request.json());
    return Response.json({ member: await addTenantMember(COMMUNITY_SLUG, tenantId, user, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
