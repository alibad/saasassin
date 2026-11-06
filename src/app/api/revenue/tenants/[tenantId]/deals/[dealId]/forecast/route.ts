import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireRevenueTenant } from "@/lib/revenue/data";
import { setDealForecast } from "@/lib/revenue/pipeline-data";
import { forecastChangeSchema, WRITE_ROLES } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; dealId: string }> };

/** The deal owner calls the forecast category; managers/admins/owners override it (audited). */
export async function PUT(request: Request, { params }: Context) {
  try {
    const { tenantId, dealId } = await params;
    const ctx = await requireRevenueTenant(tenantId, WRITE_ROLES);
    const input = forecastChangeSchema.parse(await request.json());
    return Response.json(await setDealForecast(ctx, dealId, input));
  } catch (error) {
    return fleetApiError(error);
  }
}
