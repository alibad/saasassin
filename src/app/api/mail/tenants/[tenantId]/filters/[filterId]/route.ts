import { fleetApiError } from "@/lib/fleet/platform/http";
import { filterPatchSchema, MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { deleteFilter, setFilterEnabled } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string; filterId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { filterId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    const { enabled } = filterPatchSchema.parse(await request.json());
    return Response.json({ filter: await setFilterEnabled(context, filterId, enabled) });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { filterId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    await deleteFilter(context, filterId);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
