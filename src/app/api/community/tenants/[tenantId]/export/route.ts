import { readAllForExport } from "@/lib/community/data";
import { COMMUNITY_SLUG, EXPORT_FILES, exportSchemaName, redactSettingsForExport } from "@/lib/community/model";
import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { appendAuditEvent, PRIVILEGED_ROLES, requireTenantMember } from "@/lib/fleet/platform/tenants";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Complete, versioned community export: members, profiles, spaces, content, reactions, RSVPs and audit trail. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(COMMUNITY_SLUG);
    const { tenant } = await requireTenantMember(COMMUNITY_SLUG, tenantId, user, PRIVILEGED_ROLES);
    const records = await readAllForExport(tenantId);
    records.settings = records.settings.map((settings) => ({ ...redactSettingsForExport(settings), id: settings.id }));
    const manifest = buildExportManifest(
      COMMUNITY_SLUG,
      tenantId,
      EXPORT_FILES.map(([name, schema]) => ({ path: `${name}.json`, schema: exportSchemaName(schema), records: records[name].length })),
    );
    await appendAuditEvent(COMMUNITY_SLUG, tenantId, user, "export.downloaded", { type: "tenant", id: tenantId });
    const body = {
      manifest,
      community: toPortable({ id: tenantId, name: tenant.name }),
      data: Object.fromEntries(EXPORT_FILES.map(([name]) => [name, toPortable(records[name])])),
    };
    const fileName = `community-${tenantId}-${new Date().toISOString().slice(0, 10)}.json`;
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
