import { createBoard } from "@/lib/feedback/data";
import { ADMIN_ROLES, requireTeam } from "@/lib/feedback/http";
import { createBoardSchema } from "@/lib/feedback/schemas";
import { fleetApiError } from "@/lib/fleet/platform/http";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const { user } = await requireTeam(tenantId, ADMIN_ROLES);
    const input = createBoardSchema.parse(await request.json());
    return Response.json({ board: await createBoard(tenantId, user, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
