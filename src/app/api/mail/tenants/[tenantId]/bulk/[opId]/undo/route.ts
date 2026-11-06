import { fleetApiError } from "@/lib/fleet/platform/http";
import { MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { undoBulk } from "@/lib/mail/service";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string; opId: string }> };

/** Restores the fields a bulk action changed on every thread it touched. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { opId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    return Response.json(await undoBulk(context, opId));
  } catch (error) {
    return fleetApiError(error);
  }
}
