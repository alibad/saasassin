import { z } from "zod";

import { requireSessionUser } from "@/lib/lattice/auth";
import { importEmployees } from "@/lib/lattice/data";
import { latticeApiError } from "@/lib/lattice/http";

const importSchema = z.object({
  csv: z.string().min(1),
  dryRun: z.boolean().default(true),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const actor = await requireSessionUser();
    const { organizationId } = await context.params;
    const input = importSchema.parse(await request.json());
    const preview = await importEmployees({ actor, organizationId, ...input });
    return Response.json(preview, { status: input.dryRun ? 200 : 201 });
  } catch (error) {
    return latticeApiError(error);
  }
}
