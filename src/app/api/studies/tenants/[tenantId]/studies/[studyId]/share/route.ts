import { z } from "zod";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { setResultsSharing, SLUG } from "@/lib/studies/data";

const schema = z.object({ enabled: z.boolean() });

export async function POST(request: Request, context: { params: Promise<{ tenantId: string; studyId: string }> }) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, studyId } = await context.params;
    const { enabled } = schema.parse(await request.json());
    return Response.json({ study: await setResultsSharing(user, tenantId, studyId, enabled) });
  } catch (error) {
    return fleetApiError(error);
  }
}
