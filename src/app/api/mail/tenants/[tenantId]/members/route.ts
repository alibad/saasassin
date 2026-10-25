import { fleetApiError } from "@/lib/fleet/platform/http";
import { addTenantMember, listTenantMembers, PRIVILEGED_ROLES } from "@/lib/fleet/platform/tenants";
import { MAIL_PRODUCT, memberSchema } from "@/lib/mail/schema";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const context = await mailContext(params);
    const members = await listTenantMembers(MAIL_PRODUCT, context.tenantId);
    return Response.json({ members: members.filter((member) => member.status === "active") });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const context = await mailContext(params, PRIVILEGED_ROLES);
    const input = memberSchema.parse(await request.json());
    return Response.json({ member: await addTenantMember(MAIL_PRODUCT, context.tenantId, context.user, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
