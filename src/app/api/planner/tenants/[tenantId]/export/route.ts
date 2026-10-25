import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { listAuditEvents } from "@/lib/fleet/platform/tenants";
import { audit, col, plannerContext, readMembers } from "@/lib/planner/data";
import { EXPORT_SCHEMA_VERSION, PLANNER_SLUG } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

const COLLECTIONS = ["settings", "projects", "tasks", "events", "capacity", "plans"] as const;

/** Complete, versioned JSON export of every Planner record in the workspace. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const ctx = await plannerContext(tenantId);
    const data: Record<string, unknown[]> = {};
    for (const name of COLLECTIONS) {
      const snapshot = await col(tenantId, name).get();
      data[name] = snapshot.docs.map((doc) => ({ id: doc.id, ...(toPortable(doc.data()) as Record<string, unknown>) }));
    }
    data.members = await readMembers(tenantId);
    data.auditEvents = await listAuditEvents(PLANNER_SLUG, tenantId, 1000);
    const files = Object.entries(data).map(([name, records]) => ({
      path: `${name}.json`,
      schema: `net.saasassin.planner.${name}/${EXPORT_SCHEMA_VERSION}`,
      records: records.length,
    }));
    await audit(ctx, "workspace.exported", { type: "tenant", id: tenantId }, { files: files.length });
    const payload = { manifest: buildExportManifest(PLANNER_SLUG, tenantId, files), data };
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="planner-export-${tenantId}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
