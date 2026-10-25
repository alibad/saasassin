import { fleetApiError } from "@/lib/fleet/platform/http";
import { deleteSnippet, requireRevenueTenant } from "@/lib/revenue/data";
import { WRITE_ROLES } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string; snippetId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { tenantId, snippetId } = await params;
    const ctx = await requireRevenueTenant(tenantId, WRITE_ROLES);
    await deleteSnippet(ctx, snippetId);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
