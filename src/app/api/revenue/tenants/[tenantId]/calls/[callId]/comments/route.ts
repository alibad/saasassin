import { fleetApiError } from "@/lib/fleet/platform/http";
import { addComment, requireRevenueTenant } from "@/lib/revenue/data";
import { WRITE_ROLES, commentSchema } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; callId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { tenantId, callId } = await params;
    const ctx = await requireRevenueTenant(tenantId, WRITE_ROLES);
    const input = commentSchema.parse(await request.json());
    return Response.json({ comment: await addComment(ctx, callId, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
