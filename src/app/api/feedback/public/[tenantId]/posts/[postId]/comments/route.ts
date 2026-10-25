import { addComment, PRODUCT } from "@/lib/feedback/data";
import { commentSchema } from "@/lib/feedback/schemas";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string; postId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, postId } = await params;
    const user = await requireFleetUser(PRODUCT);
    const { content } = commentSchema.parse(await request.json());
    return Response.json({ comment: await addComment(tenantId, postId, user, content) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
