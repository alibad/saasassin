import { randomUUID } from "node:crypto";

import { z } from "zod";

import { requireSessionUser } from "@/lib/lattice/auth";
import { createReviewTemplate } from "@/lib/lattice/data";
import { latticeApiError } from "@/lib/lattice/http";

const templateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  directions: z.array(z.enum(["self", "manager", "peer", "upward"])).min(1),
  questions: z.array(z.object({
    prompt: z.string().trim().min(3).max(500),
    type: z.enum(["text", "rating"]),
    required: z.boolean(),
  })).min(1).max(20),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const actor = await requireSessionUser();
    const { organizationId } = await context.params;
    const input = templateSchema.parse(await request.json());
    const templateId = await createReviewTemplate({
      actor,
      organizationId,
      ...input,
      questions: input.questions.map((question) => ({ ...question, id: randomUUID() })),
    });
    return Response.json({ templateId }, { status: 201 });
  } catch (error) {
    return latticeApiError(error);
  }
}
