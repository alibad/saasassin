import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError, requireFleetUser } from "@/lib/fleet/platform/session";
import { requireTenantMember } from "@/lib/fleet/platform/tenants";
import { importRequestSchema, mapKajabiExport } from "@/lib/creator/import";
import { CREATOR_SLUG } from "@/lib/creator/model";
import { EDITOR_ROLES } from "@/lib/creator/roles";
import { importCourses } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** dryRun: true returns the preview and mapping report; dryRun: false creates draft courses. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user, EDITOR_ROLES);
    const { text, dryRun } = importRequestSchema.parse(await request.json());
    const { courses, report } = mapKajabiExport(text);
    if (dryRun) return Response.json({ courses, report });
    if (report.errors.length) throw new FleetError(report.errors[0], 400);
    if (courses.length === 0) throw new FleetError("Nothing to import.", 400);
    const created = await importCourses(tenantId, user, courses, `kajabi-${report.format}`);
    return Response.json({ created, report }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
