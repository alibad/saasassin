import { z } from "zod";

import { requireSessionUser } from "@/lib/lattice/auth";
import { createOrganization } from "@/lib/lattice/data";
import { latticeApiError } from "@/lib/lattice/http";

const organizationSchema = z.object({
  name: z.string().trim().min(2, "Organization name must have at least two characters.").max(100),
});

export async function POST(request: Request) {
  try {
    const actor = await requireSessionUser();
    const { name } = organizationSchema.parse(await request.json());
    const organizationId = await createOrganization(actor, name);
    return Response.json({ organizationId }, { status: 201 });
  } catch (error) {
    return latticeApiError(error);
  }
}
