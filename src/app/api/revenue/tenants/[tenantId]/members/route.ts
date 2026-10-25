import { fleetApiError } from "@/lib/fleet/platform/http";
import { addTenantMember, listTenantMembers } from "@/lib/fleet/platform/tenants";
import { requireRevenueTenant } from "@/lib/revenue/data";
import { memberSchema, REVENUE_SLUG } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    await requireRevenueTenant(tenantId);
    const members = await listTenantMembers(REVENUE_SLUG, tenantId);
    return Response.json({ members: members.filter((member) => member.status === "active") });
  } catch (error) {
    return fleetApiError(error);
  }
}

/** addTenantMember enforces owner/admin server-side and writes its own audit event. */
export async function POST(request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId);
    const input = memberSchema.parse(await request.json());
    return Response.json({ member: await addTenantMember(REVENUE_SLUG, tenantId, ctx.user, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
