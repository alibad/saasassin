import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { appendAuditEvent, listAuditEvents, listTenantMembers, requireTenantMember } from "@/lib/fleet/platform/tenants";
import { buildCreatorExport } from "@/lib/creator/export";
import { CREATOR_SLUG } from "@/lib/creator/model";
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
    const payload = buildCreatorExport(tenantId, { ...school, members, audit });
    await appendAuditEvent(CREATOR_SLUG, tenantId, user, "export.downloaded", { type: "tenant", id: tenantId }, {
      courses: school.courses.length,
      enrollments: school.enrollments.length,
    });
    return new Response(JSON.stringify(payload, null, 2), {
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
