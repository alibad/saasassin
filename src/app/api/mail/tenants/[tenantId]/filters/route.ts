import { fleetApiError } from "@/lib/fleet/platform/http";
import { filterSchema, MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { createFilter } from "@/lib/mail/service";
import { listFilters, mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const context = await mailContext(params);
    return Response.json({ filters: await listFilters(context.tenantId) });
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Creates a filter rule; it applies to mail imported from now on (retro-apply is explicit). */
export async function POST(request: Request, { params }: Context) {
  try {
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    return Response.json({ filter: await createFilter(context, filterSchema.parse(await request.json())) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
