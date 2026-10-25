import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { appendAuditEvent, listAuditEvents, listTenantMembers } from "@/lib/fleet/platform/tenants";
import { exportWorkspace, SLUG } from "@/lib/studies/data";

export async function GET(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId } = await context.params;
    const data = await exportWorkspace(user, tenantId);
    const [members, audit] = await Promise.all([listTenantMembers(SLUG, tenantId), listAuditEvents(SLUG, tenantId, 500)]);
    const files: Record<string, { schema: string; records: unknown[] }> = {
      "studies.json": { schema: "net.saasassin.studies.study@1", records: data.studies },
      "study-versions.json": { schema: "net.saasassin.studies.study-version@1", records: data.versions },
      "responses.json": { schema: "net.saasassin.studies.response@1", records: data.responses },
      "members.json": { schema: "net.saasassin.fleet.membership@1", records: members },
      "audit-events.json": { schema: "net.saasassin.fleet.audit-event@1", records: audit },
    };
    const manifest = buildExportManifest(
      SLUG,
      tenantId,
      Object.entries(files).map(([path, file]) => ({ path, schema: file.schema, records: file.records.length })),
    );
    await appendAuditEvent(SLUG, tenantId, user, "workspace.exported", { type: "tenant", id: tenantId }, {
      studies: data.studies.length,
      responses: data.responses.length,
    });
    const body = {
      manifest,
      files: Object.fromEntries(Object.entries(files).map(([path, file]) => [path, toPortable(file.records)])),
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="saasassin-studies-${tenantId}.json"`,
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
