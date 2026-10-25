import { z } from "zod";

import { requireSessionUser } from "@/lib/lattice/auth";
import { transitionReviewCycle } from "@/lib/lattice/data";
import { REVIEW_CYCLE_STATES } from "@/lib/lattice/state-machine";
import { latticeApiError } from "@/lib/lattice/http";

const transitionSchema = z.object({
  targetState: z.enum(REVIEW_CYCLE_STATES),
  dryRun: z.boolean().default(true),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; cycleId: string }> },
) {
  try {
    const actor = await requireSessionUser();
    const { organizationId, cycleId } = await context.params;
    const input = transitionSchema.parse(await request.json());
    const preview = await transitionReviewCycle({
      actor,
      organizationId,
      cycleId,
      ...input,
    });
    return Response.json(preview);
  } catch (error) {
    return latticeApiError(error);
  }
}
