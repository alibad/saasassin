import { fleetApiError } from "@/lib/fleet/platform/http";
import { contactPatchSchema, MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { getContact, renameContact } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string; contactId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { contactId } = await params;
    return Response.json(await getContact(await mailContext(params), contactId));
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Edits the display name shown for this address (an empty name restores the one from headers). */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { contactId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    const { displayName } = contactPatchSchema.parse(await request.json());
    return Response.json({ contact: await renameContact(context, contactId, displayName) });
  } catch (error) {
    return fleetApiError(error);
  }
}
