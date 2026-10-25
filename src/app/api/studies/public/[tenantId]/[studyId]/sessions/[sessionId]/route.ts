import { z } from "zod";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { recordParticipantProgress } from "@/lib/studies/data";

const schema = z.object({
  token: z.string().min(16).max(128),
  answers: z
    .record(z.string().max(64), z.unknown())
    .refine((value) => Object.keys(value).length <= 80, "Too many answers."),
  blockTimings: z.record(z.string().max(64), z.number()).default({}),
  final: z.boolean().default(false),
});

/** Saves progress (for the drop-off funnel) or the final submission, validated against the frozen version. */
export async function POST(
  request: Request,
  context: { params: Promise<{ tenantId: string; studyId: string; sessionId: string }> },
) {
  try {
    const { tenantId, studyId, sessionId } = await context.params;
    const text = await request.text();
    if (text.length > 200_000) return Response.json({ error: "Submission is too large." }, { status: 413 });
    const input = schema.parse(JSON.parse(text));
    return Response.json(await recordParticipantProgress(tenantId, studyId, { sessionId, ...input }));
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ error: "Malformed submission." }, { status: 400 });
    return fleetApiError(error);
  }
}
