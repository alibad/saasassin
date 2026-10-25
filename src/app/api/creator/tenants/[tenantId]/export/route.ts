import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { appendAuditEvent, listAuditEvents, listTenantMembers, requireTenantMember } from "@/lib/fleet/platform/tenants";
import { CREATOR_SLUG, EXPORT_SCHEMA_VERSION } from "@/lib/creator/model";
import { PUBLISHER_ROLES } from "@/lib/creator/roles";
import { exportSchool } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user, PUBLISHER_ROLES);
    const [school, members, audit] = await Promise.all([
      exportSchool(tenantId),
      listTenantMembers(CREATOR_SLUG, tenantId),
      listAuditEvents(CREATOR_SLUG, tenantId, 1000),
    ]);
    const schema = (name: string) => `net.saasassin.creator.${name}@${EXPORT_SCHEMA_VERSION}`;
    const files = {
      "school.json": { schema: schema("school"), data: toPortable(school.tenant) },
      "courses.json": { schema: schema("courses"), data: toPortable(school.courses) },
      "enrollments.json": { schema: schema("enrollments"), data: toPortable(school.enrollments) },
      "leads.json": { schema: schema("leads"), data: toPortable(school.leads) },
      "members.json": { schema: schema("members"), data: toPortable(members) },
      "audit.json": { schema: schema("audit"), data: toPortable(audit) },
    };
    const manifest = buildExportManifest(
      CREATOR_SLUG,
      tenantId,
      Object.entries(files).map(([path, file]) => ({
        path,
        schema: file.schema,
        records: Array.isArray(file.data) ? file.data.length : 1,
      })),
    );
    await appendAuditEvent(CREATOR_SLUG, tenantId, user, "export.downloaded", { type: "tenant", id: tenantId }, {
      courses: school.courses.length,
      enrollments: school.enrollments.length,
    });
    return new Response(JSON.stringify({ manifest, files }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="creator-export-${tenantId}-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
