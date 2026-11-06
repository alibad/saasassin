import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { createFinding, SLUG } from "@/lib/studies/data";

/** Creates a finding; the server resolves every cited response/block against the stored study. */
export async function POST(request: Request, context: { params: Promise<{ tenantId: string; studyId: string }> }) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, studyId } = await context.params;
    return Response.json({ finding: await createFinding(user, tenantId, studyId, await request.json()) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
