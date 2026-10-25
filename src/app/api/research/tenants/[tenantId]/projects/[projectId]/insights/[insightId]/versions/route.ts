import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { listInsightVersions, requireResearchMember } from "@/lib/research/data";
import { RESEARCH_SLUG } from "@/lib/research/model";

type RouteContext = { params: Promise<{ tenantId: string; projectId: string; insightId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, projectId, insightId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    const { role } = await requireResearchMember(tenantId, user);
    return Response.json({ versions: await listInsightVersions(tenantId, projectId, insightId, { uid: user.uid, role }) });
  } catch (error) {
    return fleetApiError(error);
  }
}
