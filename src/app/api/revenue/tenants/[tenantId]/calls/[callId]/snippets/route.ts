import { fleetApiError } from "@/lib/fleet/platform/http";
import { createSnippet, requireRevenueTenant } from "@/lib/revenue/data";
import { snippetSchema, WRITE_ROLES } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; callId: string }> };

/** Clips a segment range of a call into a coaching playlist (timestamps only, no copied text). */
export async function POST(request: Request, { params }: Context) {
  try {
    const { tenantId, callId } = await params;
    const ctx = await requireRevenueTenant(tenantId, WRITE_ROLES);
    const input = snippetSchema.parse(await request.json());
    return Response.json({ snippet: await createSnippet(ctx, callId, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
