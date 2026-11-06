import { fleetApiError } from "@/lib/fleet/platform/http";
import { MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { applyFilterToExisting } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string; filterId: string }> };

export const maxDuration = 60;

/** Explicit, audited retro-apply of one saved filter to existing mail. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { filterId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    return Response.json({ result: await applyFilterToExisting(context, filterId) });
  } catch (error) {
    return fleetApiError(error);
  }
}
