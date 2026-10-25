import { fleetApiError } from "@/lib/fleet/platform/http";
import { getPublicStudy } from "@/lib/studies/data";

export async function GET(_request: Request, context: { params: Promise<{ tenantId: string; studyId: string }> }) {
  try {
    const { tenantId, studyId } = await context.params;
    return Response.json(await getPublicStudy(tenantId, studyId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fleetApiError(error);
  }
}
