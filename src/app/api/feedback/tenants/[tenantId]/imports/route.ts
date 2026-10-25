import { mapCannyCsv } from "@/lib/feedback/canny";
import { commitCannyImport } from "@/lib/feedback/data";
import { ADMIN_ROLES, requireTeam } from "@/lib/feedback/http";
import { importSchema } from "@/lib/feedback/schemas";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Canny CSV import: `commit: false` returns the mapping preview; `commit: true` applies it idempotently. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const { user } = await requireTeam(tenantId, ADMIN_ROLES);
    const { csv, commit } = importSchema.parse(await request.json());
    const mapping = mapCannyCsv(csv);
    if (!commit) return Response.json({ preview: mapping });
    if (mapping.posts.length === 0) throw new FleetError("Nothing to import: no valid rows were found.", 400);
    if (mapping.posts.length > 5000) throw new FleetError("Split imports larger than 5,000 posts.", 400);
    return Response.json({ preview: mapping, result: await commitCannyImport(tenantId, user, mapping) });
  } catch (error) {
    return fleetApiError(error);
  }
}
