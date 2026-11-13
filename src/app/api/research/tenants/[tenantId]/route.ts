import { getTeamConfig } from "@/lib/fleet/account/team-config";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { loadProfiles } from "@/lib/fleet/platform/profiles";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { listAuditEvents, listTenantMembers } from "@/lib/fleet/platform/tenants";
import { filterAuditForViewer, hiddenSourceIds, listProjects, projectStats, requireResearchMember } from "@/lib/research/data";
import { RESEARCH_SLUG } from "@/lib/research/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    const { tenant, role } = await requireResearchMember(tenantId, user);
    const [projects, members, audit, hidden] = await Promise.all([
      listProjects(tenantId),
      listTenantMembers(RESEARCH_SLUG, tenantId),
      listAuditEvents(RESEARCH_SLUG, tenantId, 100),
      hiddenSourceIds(tenantId, { uid: user.uid, role }),
    ]);
    const active = members.filter((member) => member.status === "active");
    // Names and photos of current members only: people who left keep their email in the audit log, nothing more.
    const [profiles, stats] = await Promise.all([
      loadProfiles(RESEARCH_SLUG, active.map((member) => member.uid)),
      projectStats(tenantId, hidden),
    ]);
    const config = getTeamConfig(RESEARCH_SLUG);
    const roleLabel = (id: string) => config.roles.find((option) => option.id === id)?.label ?? id;
    return Response.json({
      tenant: { id: tenant.id, name: tenant.name },
      role,
      roleLabel: roleLabel(role),
      projects,
      projectStats: stats,
      members: active.map(({ uid, email, name, role: memberRole }) => {
        const profile = profiles.get(uid);
        return {
          uid,
          email,
          name: profile?.name || name || "",
          title: profile?.title ?? "",
          photoURL: profile?.photoURL ?? null,
          role: memberRole,
          roleLabel: roleLabel(memberRole),
        };
      }),
      audit: filterAuditForViewer(audit, hidden),
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
