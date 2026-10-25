import { requireSessionUser } from "@/lib/lattice/auth";
import { latticeApiError } from "@/lib/lattice/http";
import { advanceDuePhases } from "@/lib/lattice/program-data";

/** Advances every cycle whose scheduled phase end has passed (admin-run, no cron). */
export async function POST(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const actor = await requireSessionUser();
    const { organizationId } = await context.params;
    return Response.json({ results: await advanceDuePhases({ actor, organizationId }) });
  } catch (error) {
    return latticeApiError(error);
  }
}
