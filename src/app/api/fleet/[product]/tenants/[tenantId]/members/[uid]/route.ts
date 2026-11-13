import { roleChangeSchema } from "@/lib/fleet/account/schemas";
import { assertSameOrigin, fleetApiError, readJson } from "@/lib/fleet/platform/http";
import { assertFleetProduct, requireFleetUser } from "@/lib/fleet/platform/session";
import { changeMemberRole, removeMember } from "@/lib/fleet/platform/team";

type RouteContext = { params: Promise<{ product: string; tenantId: string; uid: string }> };

/** Changes a member's role. Admin rights changes need a recent sign-in ("reauth_required"). */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product, tenantId, uid } = await params;
    assertFleetProduct(product);
    const user = await requireFleetUser(product);
    const { role } = roleChangeSchema.parse(await readJson(request));
    return Response.json({ member: await changeMemberRole(product, tenantId, user, uid, role) });
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Removes someone from the workspace. To remove yourself, POST …/leave. */
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    assertSameOrigin(request);
    const { product, tenantId, uid } = await params;
    assertFleetProduct(product);
    const user = await requireFleetUser(product);
    await removeMember(product, tenantId, user, uid);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
