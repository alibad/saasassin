import { fleetApiError } from "@/lib/fleet/platform/http";
import { startParticipantSession } from "@/lib/studies/data";

/** Anonymous participant start. No PII is collected; the returned token authorizes only this session. */
export async function POST(_request: Request, context: { params: Promise<{ tenantId: string; studyId: string }> }) {
  try {
    const { tenantId, studyId } = await context.params;
    return Response.json(await startParticipantSession(tenantId, studyId), { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
