import { EXPORT_COLLECTIONS, loadAllRecords, loadTypedRecords, PRODUCT } from "@/lib/feedback/data";
import { toFiderInstances } from "@/lib/feedback/fider";
import { ADMIN_ROLES, requireTeam } from "@/lib/feedback/http";
import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { appendAuditEvent, listAuditEvents, listTenantMembers } from "@/lib/fleet/platform/tenants";

type RouteContext = { params: Promise<{ tenantId: string }> };

const SCHEMA = "net.saasassin.feedback";
const VERSION = "1.0.0";

/** Complete versioned workspace export plus a Fider-shaped mapping (?format=fider for the mapping alone). */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const { user, tenant } = await requireTeam(tenantId, ADMIN_ROLES);
    const format = new URL(request.url).searchParams.get("format") === "fider" ? "fider" : "full";
    const [records, typed, members, audit] = await Promise.all([
      loadAllRecords(tenantId),
      loadTypedRecords(tenantId),
      listTenantMembers(PRODUCT, tenantId),
      listAuditEvents(PRODUCT, tenantId, 1000),
    ]);
    const fider = toFiderInstances({ ...typed, members: members.filter((member) => member.status === "active") });
    await appendAuditEvent(PRODUCT, tenantId, user, "workspace.exported", { type: "tenant", id: tenantId }, { format });

    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "fider") {
      return new Response(JSON.stringify(fider, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="feedback-${tenantId}-fider-${stamp}.json"`,
        },
      });
    }

    const files = [
      ...EXPORT_COLLECTIONS.map((name) => ({ path: `${name}.json`, schema: `${SCHEMA}.${name}@${VERSION}`, records: records[name].length })),
      { path: "members.json", schema: `${SCHEMA}.members@${VERSION}`, records: members.length },
      { path: "audit-events.json", schema: `${SCHEMA}.audit-events@${VERSION}`, records: audit.length },
      { path: "fider-mapping.json", schema: `${fider.schema}@${fider.version}`, records: fider.instances.length },
    ];
    const body = {
      manifest: buildExportManifest(PRODUCT, tenantId, files),
      tenant: toPortable({ id: tenant.id, name: tenant.name }),
      data: {
        ...records,
        members: toPortable(members),
        auditEvents: audit,
      },
      fider,
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="feedback-${tenantId}-${stamp}.json"`,
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
