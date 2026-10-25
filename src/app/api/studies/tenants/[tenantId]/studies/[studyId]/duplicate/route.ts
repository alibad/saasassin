import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { duplicateStudy, SLUG } from "@/lib/studies/data";

export async function POST(_request: Request, context: { params: Promise<{ tenantId: string; studyId: string }> }) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, studyId } = await context.params;
    return Response.json({ study: await duplicateStudy(user, tenantId, studyId) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
