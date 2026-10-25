import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { loadProjectSnapshot, requireResearchMember } from "@/lib/research/data";
import { RESEARCH_SLUG } from "@/lib/research/model";
import { buildSearchDocs, rankDocuments } from "@/lib/research/search";

type RouteContext = { params: Promise<{ tenantId: string; projectId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, projectId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    await requireResearchMember(tenantId, user);
    const query = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 200);
    // Only records of a project inside a tenant the caller is a verified member of are ever indexed.
    const snapshot = await loadProjectSnapshot(tenantId, projectId);
    const results = rankDocuments(query, buildSearchDocs(snapshot), 60);
    return Response.json({ query, results });
  } catch (error) {
    return fleetApiError(error);
  }
}
