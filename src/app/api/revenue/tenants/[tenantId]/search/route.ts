import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireRevenueTenant, searchCalls } from "@/lib/revenue/data";

type Context = { params: Promise<{ tenantId: string }> };

/** Searches every transcript in the workspace for a phrase. Queries are not logged. */
export async function GET(request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json(await searchCalls(ctx, query.slice(0, 120)));
  } catch (error) {
    return fleetApiError(error);
  }
}
