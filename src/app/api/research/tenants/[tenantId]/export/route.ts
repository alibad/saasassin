import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { appendAuditEvent } from "@/lib/fleet/platform/tenants";
import { exportWorkspace, requireResearchMember } from "@/lib/research/data";
import { RESEARCH_SLUG } from "@/lib/research/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Complete workspace export: every project (sources, transcripts, highlights, insights, themes), members and audit. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    const { tenant } = await requireResearchMember(tenantId, user);
    const body = await exportWorkspace(tenantId, { id: tenant.id, name: tenant.name });
    await appendAuditEvent(RESEARCH_SLUG, tenantId, user, "workspace.exported", { type: "tenant", id: tenantId }, { projects: body.projects.length });
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="research-workspace-${tenantId}-${body.manifest.exportedAt.slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
