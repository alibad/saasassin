import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireRevenueTenant } from "@/lib/revenue/data";
import { linkSpeaker } from "@/lib/revenue/pipeline-data";
import { speakerLinkSchema, WRITE_ROLES } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; callId: string }> };

/** Links a transcript speaker to a contact (customer) or workspace member (internal), or unlinks it. */
export async function PUT(request: Request, { params }: Context) {
  try {
    const { tenantId, callId } = await params;
    const ctx = await requireRevenueTenant(tenantId, WRITE_ROLES);
    const input = speakerLinkSchema.parse(await request.json());
    return Response.json(await linkSpeaker(ctx, callId, input));
  } catch (error) {
    return fleetApiError(error);
  }
}
