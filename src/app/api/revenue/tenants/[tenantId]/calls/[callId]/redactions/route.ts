import { fleetApiError } from "@/lib/fleet/platform/http";
import { redactCall, requireRevenueTenant } from "@/lib/revenue/data";
import { COACH_ROLES, redactionSchema } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; callId: string }> };

/** Redacts a span of transcript text; the removed text is not retained anywhere. */
export async function POST(request: Request, { params }: Context) {
  try {
    const { tenantId, callId } = await params;
    const ctx = await requireRevenueTenant(tenantId, COACH_ROLES);
    const input = redactionSchema.parse(await request.json());
    return Response.json({ redaction: await redactCall(ctx, callId, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
