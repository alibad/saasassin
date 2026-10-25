import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";
import { audit, col, plannerContext } from "@/lib/planner/data";
import { EDITOR_ROLES } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string; eventId: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, eventId } = await params;
    const ctx = await plannerContext(tenantId, EDITOR_ROLES);
    const ref = col(tenantId, "events").doc(eventId);
    const doc = await ref.get();
    if (!doc.exists) throw new FleetError("Event not found.", 404);
    await ref.delete();
    await audit(ctx, "event.deleted", { type: "event", id: eventId }, { title: doc.get("title") });
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
