import { fleetApiError } from "@/lib/fleet/platform/http";
import { listAuditEvents } from "@/lib/fleet/platform/tenants";
import { MAIL_PRODUCT } from "@/lib/mail/schema";
import { mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const context = await mailContext(params);
    return Response.json({ events: await listAuditEvents(MAIL_PRODUCT, context.tenantId, 100) });
  } catch (error) {
    return fleetApiError(error);
  }
}
