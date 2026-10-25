import { z } from "zod";

import { requireSessionUser } from "@/lib/lattice/auth";
import { saveReview } from "@/lib/lattice/data";
import { latticeApiError } from "@/lib/lattice/http";

const reviewSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.number()])),
  submit: z.boolean().default(false),
});

export async function PUT(
  request: Request,
  context: {
    params: Promise<{ organizationId: string; cycleId: string; reviewId: string }>;
  },
) {
  try {
    const actor = await requireSessionUser();
    const { organizationId, cycleId, reviewId } = await context.params;
    const input = reviewSchema.parse(await request.json());
    await saveReview({ actor, organizationId, cycleId, reviewId, ...input });
    return Response.json({ ok: true, state: input.submit ? "submitted" : "draft" });
  } catch (error) {
    return latticeApiError(error);
  }
}
