import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { appendAuditEvent, listAuditEvents, listTenantMembers } from "@/lib/fleet/platform/tenants";
import { listProjects, loadProjectSnapshot, loadSourcesWithOriginals, requireResearchMember } from "@/lib/research/data";
import { buildProjectExport, RESEARCH_EXPORT_SCHEMA, RESEARCH_EXPORT_VERSION } from "@/lib/research/export";
import { RESEARCH_SLUG } from "@/lib/research/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Complete workspace export: every project (sources, transcripts, highlights, insights, themes), members and audit. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    const { tenant } = await requireResearchMember(tenantId, user);
    const projects = await listProjects(tenantId);
    const projectExports = await Promise.all(
      projects.map(async (project) => {
        const snapshot = await loadProjectSnapshot(tenantId, project.id);
        const originals = new Map((await loadSourcesWithOriginals(tenantId, project.id)).map((source) => [source.id, source.originalText ?? null]));
        return buildProjectExport({
          ...snapshot,
          sources: snapshot.sources.map((source) => ({ ...source, originalText: originals.get(source.id) ?? null })),
        });
      }),
    );
    const [members, audit] = await Promise.all([listTenantMembers(RESEARCH_SLUG, tenantId), listAuditEvents(RESEARCH_SLUG, tenantId, 1000)]);
    const manifest = buildExportManifest(RESEARCH_SLUG, tenantId, [
      { path: "projects", schema: `${RESEARCH_EXPORT_SCHEMA}@${RESEARCH_EXPORT_VERSION}`, records: projectExports.length },
      { path: "members", schema: "net.saasassin.membership@1.0.0", records: members.length },
      { path: "auditEvents", schema: "net.saasassin.audit-event@1.0.0", records: audit.length },
    ]);
    await appendAuditEvent(RESEARCH_SLUG, tenantId, user, "workspace.exported", { type: "tenant", id: tenantId }, { projects: projectExports.length });
    const body = {
      manifest,
      workspace: { id: tenant.id, name: tenant.name },
      projects: projectExports,
      members: toPortable(members),
      auditEvents: audit,
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="research-workspace-${tenantId}-${manifest.exportedAt.slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
