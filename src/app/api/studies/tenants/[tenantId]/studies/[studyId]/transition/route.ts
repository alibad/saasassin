import { z } from "zod";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { SLUG, transitionStudy } from "@/lib/studies/data";
import { STUDY_TRANSITIONS } from "@/lib/studies/model";

const schema = z.object({ transition: z.enum(STUDY_TRANSITIONS) });

export async function POST(request: Request, context: { params: Promise<{ tenantId: string; studyId: string }> }) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, studyId } = await context.params;
    const { transition } = schema.parse(await request.json());
    return Response.json({ study: await transitionStudy(user, tenantId, studyId, transition) });
  } catch (error) {
    return fleetApiError(error);
  }
}
