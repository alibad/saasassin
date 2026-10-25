import { z } from "zod";

import { requireSessionUser } from "@/lib/lattice/auth";
import { createRole } from "@/lib/lattice/data";
import { PERMISSIONS } from "@/lib/lattice/permissions";
import { latticeApiError } from "@/lib/lattice/http";

const roleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(240).default(""),
  permissions: z.array(z.enum(PERMISSIONS)).min(1, "Choose at least one permission."),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const actor = await requireSessionUser();
    const { organizationId } = await context.params;
    const input = roleSchema.parse(await request.json());
    const roleId = await createRole({ actor, organizationId, ...input });
    return Response.json({ roleId }, { status: 201 });
  } catch (error) {
    return latticeApiError(error);
  }
}
