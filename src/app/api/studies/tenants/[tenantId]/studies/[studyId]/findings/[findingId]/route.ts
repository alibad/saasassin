import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { deleteFinding, SLUG, updateFinding } from "@/lib/studies/data";

type Context = { params: Promise<{ tenantId: string; studyId: string; findingId: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, studyId, findingId } = await context.params;
    return Response.json({ finding: await updateFinding(user, tenantId, studyId, findingId, await request.json()) });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, studyId, findingId } = await context.params;
    await deleteFinding(user, tenantId, studyId, findingId);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
