import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { listAuditEvents, listTenantMembers } from "@/lib/fleet/platform/tenants";
import { listProjects, requireResearchMember } from "@/lib/research/data";
import { RESEARCH_SLUG } from "@/lib/research/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    const { tenant, role } = await requireResearchMember(tenantId, user);
    const [projects, members, audit] = await Promise.all([
      listProjects(tenantId),
      listTenantMembers(RESEARCH_SLUG, tenantId),
      listAuditEvents(RESEARCH_SLUG, tenantId, 100),
    ]);
    return Response.json({
      tenant: { id: tenant.id, name: tenant.name },
      role,
      projects,
      members: members.filter((member) => member.status === "active").map(({ uid, email, name, role: memberRole }) => ({ uid, email, name, role: memberRole })),
      audit,
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
