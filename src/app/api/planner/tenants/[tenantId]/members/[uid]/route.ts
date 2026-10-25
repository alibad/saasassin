import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";
import { PRIVILEGED_ROLES } from "@/lib/fleet/platform/tenants";
import { audit, col, plannerContext, readMembers } from "@/lib/planner/data";
import { capacitySchema } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string; uid: string }> };

/** Sets a person's daily task capacity used by the scheduler. */
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, uid } = await params;
    const ctx = await plannerContext(tenantId, PRIVILEGED_ROLES);
    const input = capacitySchema.parse(await request.json());
    const members = await readMembers(tenantId);
    if (!members.some((member) => member.uid === uid)) throw new FleetError("Member not found.", 404);
    await col(tenantId, "capacity").doc(uid).set({ capacityMinutesPerDay: input.capacityMinutesPerDay });
    await audit(ctx, "member.capacity_updated", { type: "membership", id: uid }, input);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
