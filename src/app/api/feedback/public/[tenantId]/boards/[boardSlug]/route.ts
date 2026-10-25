import { createPost, dispatchWebhooks, loadPublicBoard, PRODUCT } from "@/lib/feedback/data";
import { createPostSchema } from "@/lib/feedback/schemas";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { getFleetUser, requireFleetUser } from "@/lib/fleet/platform/session";

type RouteContext = { params: Promise<{ tenantId: string; boardSlug: string }> };

/** Unauthenticated read of a public board; signed-in viewers also get their own votes. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, boardSlug } = await params;
    const viewer = await getFleetUser(PRODUCT);
    return Response.json(await loadPublicBoard(tenantId, boardSlug, viewer));
  } catch (error) {
    return fleetApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, boardSlug } = await params;
    const user = await requireFleetUser(PRODUCT);
    const input = createPostSchema.parse(await request.json());
    const post = await createPost(tenantId, boardSlug, user, input);
    await dispatchWebhooks(tenantId, "post.created", { post: { id: post.id, number: post.number, title: input.title, description: input.description, boardSlug, status: "open" } });
    return Response.json({ post }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
