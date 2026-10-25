import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireRevenueTenant, saveTracker } from "@/lib/revenue/data";
import { ADMIN_ROLES, trackerSchema } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    const input = trackerSchema.parse(await request.json());
    return Response.json(await saveTracker(ctx, null, input), { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
