import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { applyResearchAction, loadProjectSnapshot, requireResearchMember } from "@/lib/research/data";
import { actionSchema, RESEARCH_SLUG } from "@/lib/research/model";

type RouteContext = { params: Promise<{ tenantId: string; projectId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId, projectId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    const { role } = await requireResearchMember(tenantId, user);
    return Response.json({ role, ...(await loadProjectSnapshot(tenantId, projectId)) });
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Every project mutation goes through one validated, role-checked, audited action endpoint. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, projectId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    const { role } = await requireResearchMember(tenantId, user, "edit");
    const action = actionSchema.parse(await request.json());
    const result = await applyResearchAction(tenantId, projectId, user, role, action);
    return Response.json({ ok: true, result });
  } catch (error) {
    return fleetApiError(error);
  }
}
