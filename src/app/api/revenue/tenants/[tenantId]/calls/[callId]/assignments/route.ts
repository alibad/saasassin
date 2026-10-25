import { fleetApiError } from "@/lib/fleet/platform/http";
import { createAssignment, requireRevenueTenant } from "@/lib/revenue/data";
import { assignmentSchema, COACH_ROLES } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; callId: string }> };

/** Managers, admins and owners assign a call (optionally at a timestamp) to a rep for review. */
export async function POST(request: Request, { params }: Context) {
  try {
    const { tenantId, callId } = await params;
    const ctx = await requireRevenueTenant(tenantId, COACH_ROLES);
    const input = assignmentSchema.parse(await request.json());
    return Response.json({ assignment: await createAssignment(ctx, callId, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
