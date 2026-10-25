import { changeStatus, listComments, listVoters, mergePosts, moderate, setPostTags } from "@/lib/feedback/data";
import { ADMIN_ROLES, requireTeam, TRIAGE_ROLES } from "@/lib/feedback/http";
import { postActionSchema } from "@/lib/feedback/schemas";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string; postId: string }> };

/** Team view of one post: every comment (including hidden) and, for admins, the voter list. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, postId } = await params;
    const { role } = await requireTeam(tenantId);
    const comments = await listComments(tenantId, postId);
    const voters = ADMIN_ROLES.includes(role) ? await listVoters(tenantId, postId) : null;
    return Response.json({ comments, voters });
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, postId } = await params;
    const input = postActionSchema.parse(await request.json());
    const { user } = await requireTeam(tenantId, input.action === "tags" ? TRIAGE_ROLES : ADMIN_ROLES);
    switch (input.action) {
      case "status":
        return Response.json(await changeStatus(tenantId, user, postId, input.status, input.note));
      case "merge":
        return Response.json(await mergePosts(tenantId, user, postId, input.canonicalId, input.note));
      case "tags":
        return Response.json(await setPostTags(tenantId, user, postId, input.tagIds));
      case "moderate":
        if (input.hidden && input.reason.length < 3) throw new FleetError("Record why the post is hidden.", 400);
        await moderate(tenantId, user, { kind: "post", id: postId, hidden: input.hidden, reason: input.reason });
        return Response.json({ ok: true });
    }
  } catch (error) {
    return fleetApiError(error);
  }
}
