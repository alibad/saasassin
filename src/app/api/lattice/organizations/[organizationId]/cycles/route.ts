import { z } from "zod";

import { requireSessionUser } from "@/lib/lattice/auth";
import { createReviewCycle } from "@/lib/lattice/data";
import { latticeApiError } from "@/lib/lattice/http";

const cycleSchema = z.object({
  name: z.string().trim().min(2).max(100),
  templateId: z.string().min(1),
  dueDate: z.string().date().nullable(),
  peerNominationEnabled: z.boolean().default(false),
  calibrationEnabled: z.boolean().default(true),
  anonymityThreshold: z.number().int().min(1).max(10).default(3),
  schedule: z.object({
    launchOn: z.string().date().nullable(),
    nominationEndsOn: z.string().date().nullable(),
    calibrationEndsOn: z.string().date().nullable(),
    acknowledgementEndsOn: z.string().date().nullable(),
  }).partial().default({}),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const actor = await requireSessionUser();
    const { organizationId } = await context.params;
    const input = cycleSchema.parse(await request.json());
    const cycleId = await createReviewCycle({ actor, organizationId, ...input });
    return Response.json({ cycleId }, { status: 201 });
  } catch (error) {
    return latticeApiError(error);
  }
}
