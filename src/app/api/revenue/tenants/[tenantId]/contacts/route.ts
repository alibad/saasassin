import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireRevenueTenant } from "@/lib/revenue/data";
import { createContact } from "@/lib/revenue/pipeline-data";
import { contactSchema, WRITE_ROLES } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string }> };

/** Adds a person on an account (reps and up). */
export async function POST(request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId, WRITE_ROLES);
    const input = contactSchema.parse(await request.json());
    return Response.json({ contact: await createContact(ctx, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
