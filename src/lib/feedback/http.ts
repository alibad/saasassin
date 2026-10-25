import "server-only";

import { requireFleetUser } from "@/lib/fleet/platform/session";
import { PRIVILEGED_ROLES, requireTenantMember, type FleetTenantRole } from "@/lib/fleet/platform/tenants";

import { PRODUCT } from "./data";

/** Team-side guard: signed-in Feedback user with an active membership (and role, when given). */
export async function requireTeam(tenantId: string, roles?: FleetTenantRole[]) {
  const user = await requireFleetUser(PRODUCT);
  const membership = await requireTenantMember(PRODUCT, tenantId, user, roles);
  return { user, role: membership.role, tenant: membership.tenant };
}

export const ADMIN_ROLES = PRIVILEGED_ROLES;
/** Members can triage (tag) but status, merge, moderation and boards stay with owners/admins. */
export const TRIAGE_ROLES: FleetTenantRole[] = ["owner", "admin", "member"];
