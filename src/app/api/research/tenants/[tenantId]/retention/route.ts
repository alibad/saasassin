import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { listRetentionQueue, requireResearchMember } from "@/lib/research/data";
import { RESEARCH_SLUG } from "@/lib/research/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Interviews whose retention date has passed or is near, or whose consent is missing or withdrawn. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    await requireResearchMember(tenantId, user);
    return Response.json({ items: await listRetentionQueue(tenantId) });
  } catch (error) {
    return fleetApiError(error);
  }
}
