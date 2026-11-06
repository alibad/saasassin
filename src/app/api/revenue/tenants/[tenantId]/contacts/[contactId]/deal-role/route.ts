import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireRevenueTenant } from "@/lib/revenue/data";
import { setContactDealRole } from "@/lib/revenue/pipeline-data";
import { contactDealRoleSchema, WRITE_ROLES } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; contactId: string }> };

/** Sets the contact's role on a deal (champion, decision maker, blocker, ...) or removes them from it. */
export async function PUT(request: Request, { params }: Context) {
  try {
    const { tenantId, contactId } = await params;
    const ctx = await requireRevenueTenant(tenantId, WRITE_ROLES);
    const input = contactDealRoleSchema.parse(await request.json());
    return Response.json(await setContactDealRole(ctx, contactId, input));
  } catch (error) {
    return fleetApiError(error);
  }
}
