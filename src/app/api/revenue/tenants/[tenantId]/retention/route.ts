import { fleetApiError } from "@/lib/fleet/platform/http";
import { applyRetention, getRetentionQueue, previewRetention, requireRevenueTenant } from "@/lib/revenue/data";
import { ADMIN_ROLES, retentionApplySchema } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string }> };

/** The retention queue: calls past their retention date (with due dates) and calls due soon. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    const [preview, queue] = await Promise.all([previewRetention(ctx), getRetentionQueue(ctx)]);
    return Response.json({ ...preview, queue });
  } catch (error) {
    return fleetApiError(error);
  }
}

/**
 * Deletes calls past the retention period (same rule as the queue) and audits it. An optional
 * `callIds` body applies it to selected due calls only.
 */
export async function POST(request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId, ADMIN_ROLES);
    const text = await request.text();
    const { callIds } = retentionApplySchema.parse(text ? JSON.parse(text) : {});
    return Response.json(await applyRetention(ctx, callIds));
  } catch (error) {
    return fleetApiError(error);
  }
}
