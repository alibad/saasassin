import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { createProject, requireResearchMember } from "@/lib/research/data";
import { projectInputSchema, RESEARCH_SLUG } from "@/lib/research/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    await requireResearchMember(tenantId, user, "edit");
    const input = projectInputSchema.parse(await request.json());
    return Response.json({ project: await createProject(tenantId, user, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
