import { z } from "zod";

import { getTeamConfig } from "@/lib/fleet/account/team-config";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { loadProfiles } from "@/lib/fleet/platform/profiles";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { addTenantMember, listTenantMembers, requireTenantMember } from "@/lib/fleet/platform/tenants";
import { SLUG } from "@/lib/studies/data";

const inviteSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  role: z.enum(["admin", "member", "viewer"]),
});

type Context = { params: Promise<{ tenantId: string }> };

/** Active members with their profile name and photo, so the workspace can show who did what. */
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId } = await context.params;
    const { role } = await requireTenantMember(SLUG, tenantId, user);
    const active = (await listTenantMembers(SLUG, tenantId)).filter((member) => member.status === "active");
    const profiles = await loadProfiles(SLUG, active.map((member) => member.uid));
    const config = getTeamConfig(SLUG);
    const roleLabel = (id: string) => config.roles.find((option) => option.id === id)?.label ?? id;
    return Response.json({
      role,
      roleLabel: roleLabel(role),
      members: active.map((member) => {
        const profile = profiles.get(member.uid);
        return {
          ...member,
          name: profile?.name || member.name || "",
          photoURL: profile?.photoURL ?? null,
          roleLabel: roleLabel(member.role),
        };
      }),
    });
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Kept for older clients; the team page invites by email through the shared team API instead. */
export async function POST(request: Request, context: Context) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId } = await context.params;
    const input = inviteSchema.parse(await request.json());
    return Response.json({ member: await addTenantMember(SLUG, tenantId, user, input) }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
