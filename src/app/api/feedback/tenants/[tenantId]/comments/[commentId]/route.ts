import { moderate } from "@/lib/feedback/data";
import { ADMIN_ROLES, requireTeam } from "@/lib/feedback/http";
import { moderateCommentSchema } from "@/lib/feedback/schemas";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string; commentId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, commentId } = await params;
    const { user } = await requireTeam(tenantId, ADMIN_ROLES);
    const input = moderateCommentSchema.parse(await request.json());
    if (input.hidden && input.reason.length < 3) throw new FleetError("Record why the comment is hidden.", 400);
    await moderate(tenantId, user, { kind: "comment", id: commentId, ...input });
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
