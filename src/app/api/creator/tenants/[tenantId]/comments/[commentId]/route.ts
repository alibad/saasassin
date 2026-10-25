import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { requireTenantMember } from "@/lib/fleet/platform/tenants";
import { CREATOR_SLUG, commentModerationSchema } from "@/lib/creator/model";
import { EDITOR_ROLES } from "@/lib/creator/roles";
import { setCommentHidden } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string; commentId: string }> };

/** Hide or restore a learner comment; every change is audited. */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, commentId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user, EDITOR_ROLES);
    const { hidden } = commentModerationSchema.parse(await request.json());
    return Response.json({ comment: await setCommentHidden(tenantId, user, commentId, hidden) });
  } catch (error) {
    return fleetApiError(error);
  }
}
