import { updateBoard } from "@/lib/feedback/data";
import { ADMIN_ROLES, requireTeam } from "@/lib/feedback/http";
import { updateBoardSchema } from "@/lib/feedback/schemas";
import { fleetApiError } from "@/lib/fleet/platform/http";

type RouteContext = { params: Promise<{ tenantId: string; boardId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, boardId } = await params;
    const { user } = await requireTeam(tenantId, ADMIN_ROLES);
    const input = updateBoardSchema.parse(await request.json());
    await updateBoard(tenantId, user, boardId, input);
    return Response.json({ ok: true });
  } catch (error) {
    return fleetApiError(error);
  }
}
