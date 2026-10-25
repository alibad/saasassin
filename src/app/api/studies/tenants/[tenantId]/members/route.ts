import { z } from "zod";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { addTenantMember, listTenantMembers, requireTenantMember } from "@/lib/fleet/platform/tenants";
import { SLUG } from "@/lib/studies/data";

const inviteSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  role: z.enum(["admin", "member", "viewer"]),
});

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId } = await context.params;
    const { role } = await requireTenantMember(SLUG, tenantId, user);
    const members = await listTenantMembers(SLUG, tenantId);
    return Response.json({ role, members: members.filter((member) => member.status === "active") });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId } = await context.params;
    const input = inviteSchema.parse(await request.json());
    return Response.json({ member: await addTenantMember(SLUG, tenantId, user, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
