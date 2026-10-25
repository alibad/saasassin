import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { appendAuditEvent } from "@/lib/fleet/platform/tenants";
import { exportProject, requireResearchMember } from "@/lib/research/data";
import { RESEARCH_SLUG } from "@/lib/research/model";

type RouteContext = { params: Promise<{ tenantId: string; projectId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, projectId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    await requireResearchMember(tenantId, user);
    const body = await exportProject(tenantId, projectId);
    await appendAuditEvent(RESEARCH_SLUG, tenantId, user, "project.exported", { type: "project", id: projectId }, { counts: body.counts });
    const fileName = `research-${body.project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || projectId}-${body.exportedAt.slice(0, 10)}.json`;
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
