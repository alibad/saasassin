import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { requireResearchMember, searchProject } from "@/lib/research/data";
import { RESEARCH_SLUG } from "@/lib/research/model";

type RouteContext = { params: Promise<{ tenantId: string; projectId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, projectId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    const { role } = await requireResearchMember(tenantId, user);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    // Only records of a project inside a tenant the caller is a verified member of are ever indexed.
    return Response.json({ query, results: await searchProject(tenantId, projectId, query, { uid: user.uid, role }) });
  } catch (error) {
    return fleetApiError(error);
  }
}
