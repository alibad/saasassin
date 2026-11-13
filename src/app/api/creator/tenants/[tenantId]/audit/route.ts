import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { listAuditEvents, requireTenantMember } from "@/lib/fleet/platform/tenants";
import { CREATOR_SLUG } from "@/lib/creator/model";
import { creatorPeopleRecord } from "@/lib/creator/people";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user);
    const events = await listAuditEvents(CREATOR_SLUG, tenantId, 100);
    // Names and photos for the people in the log (teammates and learners).
    const people = await creatorPeopleRecord(events.map((event) => event.actor?.uid ?? ""));
    return Response.json({ events, people });
  } catch (error) {
    return fleetApiError(error);
  }
}
