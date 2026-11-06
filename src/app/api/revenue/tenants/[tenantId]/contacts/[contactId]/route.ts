import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireRevenueTenant } from "@/lib/revenue/data";
import { deleteContact, updateContact } from "@/lib/revenue/pipeline-data";
import { contactUpdateSchema, WRITE_ROLES } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; contactId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { tenantId, contactId } = await params;
    const ctx = await requireRevenueTenant(tenantId, WRITE_ROLES);
    const input = contactUpdateSchema.parse(await request.json());
    return Response.json({ contact: await updateContact(ctx, contactId, input) });
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Deletes the contact and unlinks it from every transcript speaker. */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { tenantId, contactId } = await params;
    const ctx = await requireRevenueTenant(tenantId, WRITE_ROLES);
    await deleteContact(ctx, contactId);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
