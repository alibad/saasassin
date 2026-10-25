import { fleetApiError } from "@/lib/fleet/platform/http";
import { createAccount, requireRevenueTenant } from "@/lib/revenue/data";
import { WRITE_ROLES, accountSchema } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId, WRITE_ROLES);
    const input = accountSchema.parse(await request.json());
    return Response.json({ account: await createAccount(ctx, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
