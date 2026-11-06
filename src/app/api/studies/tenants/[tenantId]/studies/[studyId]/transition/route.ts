import { after } from "next/server";
import { z } from "zod";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { dispatchStudyEvent, SLUG, studyClosedEvent, transitionStudy } from "@/lib/studies/data";
import { STUDY_TRANSITIONS } from "@/lib/studies/model";

const schema = z.object({ transition: z.enum(STUDY_TRANSITIONS) });

export async function POST(request: Request, context: { params: Promise<{ tenantId: string; studyId: string }> }) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, studyId } = await context.params;
    const { transition } = schema.parse(await request.json());
    const study = await transitionStudy(user, tenantId, studyId, transition);
    if (transition === "close") after(() => dispatchStudyEvent(tenantId, studyClosedEvent(study, user)));
    return Response.json({ study });
  } catch (error) {
    return fleetApiError(error);
  }
}
