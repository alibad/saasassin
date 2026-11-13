import "server-only";

import { LATTICE_SESSION_COOKIE, type SessionUser } from "@/lib/lattice/auth";
import { requireDb, resolveMemberSnapshot } from "@/lib/lattice/data";
import { effectiveRolePermissions, type Permission } from "@/lib/lattice/permissions";
import type { AccountContext } from "@/lib/fleet/platform/account-routes";
import { loadProfiles } from "@/lib/fleet/platform/profiles";
import { FleetError, readSessionCookieUser } from "@/lib/fleet/platform/session";
import type { WorkspaceSnapshot } from "@/types/lattice";

/**
 * Performance keeps its own session (saasassin_lattice_session) and organization directory,
 * but shares the fleet's profile, photo and avatar endpoints. Its profile lives at
 * products/performance/users/{uid}, like every other product's.
 */
export const PERFORMANCE_PRODUCT = "performance";

/** Whether both people are active members of at least one Performance organization. */
export async function sharesPerformanceOrganization(viewerUid: string, subjectUid: string) {
  const db = requireDb();
  const [viewerOrgs, subjectOrgs] = await Promise.all([
    db.collection(`users/${viewerUid}/memberships`).get(),
    db.collection(`users/${subjectUid}/memberships`).get(),
  ]);
  const subjectIds = new Set(subjectOrgs.docs.map((doc) => doc.id));
  const shared = viewerOrgs.docs.map((doc) => doc.id).filter((id) => subjectIds.has(id));
  for (const organizationId of shared) {
    const [viewer, subject] = await Promise.all([
      resolveMemberSnapshot(db, organizationId, viewerUid),
      resolveMemberSnapshot(db, organizationId, subjectUid),
    ]);
    if (viewer.exists && subject.exists && viewer.get("status") === "active" && subject.get("status") === "active") {
      return true;
    }
  }
  return false;
}

export async function performanceAccountContext(): Promise<AccountContext> {
  // A standalone repository for another product never serves Performance accounts.
  const standalone = process.env.STANDALONE_PRODUCT;
  if (standalone && standalone !== PERFORMANCE_PRODUCT) throw new FleetError("Unknown product.", 404);
  const user = await readSessionCookieUser(LATTICE_SESSION_COOKIE);
  if (!user) throw new FleetError("Sign in to continue.", 401);
  return {
    product: PERFORMANCE_PRODUCT,
    user,
    workspaces: false,
    canViewAvatar: sharesPerformanceOrganization,
    sessionCookie: LATTICE_SESSION_COOKIE,
  };
}

/**
 * Profile photos for the people in a workspace snapshot, keyed by directory member id.
 *
 * Only active members linked to an account have a photo (their uploaded one, served by the
 * avatars route to people who share an active organization with them, or their sign-in
 * provider's). Imported people who have not signed in yet show initials. Nothing is returned
 * unless the viewer is an active member themselves, which is the rule the avatars route
 * applies, so the directory never reveals more than that route would.
 */
export async function memberPhotos(snapshot: WorkspaceSnapshot): Promise<Record<string, string>> {
  if (snapshot.currentMember?.status !== "active") return {};
  const linked = snapshot.members.filter((member) => member.status === "active" && member.authUid);
  if (!linked.length) return {};
  const profiles = await loadProfiles(PERFORMANCE_PRODUCT, linked.map((member) => member.authUid!));
  const photos: Record<string, string> = {};
  for (const member of linked) {
    const photoURL = profiles.get(member.authUid!)?.photoURL;
    if (photoURL) photos[member.id] = photoURL;
  }
  return photos;
}

export type ShellContext = {
  memberships: WorkspaceSnapshot["memberships"];
  organization: { id: string; name: string } | null;
  permissions: Permission[];
  roleName: string | null;
};

/**
 * Just enough to draw the signed-in shell (organization switcher and navigation) on pages
 * outside the workspace itself, such as account settings.
 */
export async function getShellContext(user: SessionUser, requestedOrganizationId?: string): Promise<ShellContext> {
  const db = requireDb();
  const membershipsSnapshot = await db.collection(`users/${user.uid}/memberships`).get();
  const memberships = membershipsSnapshot.docs.map((document) => ({
    organizationId: document.id,
    organizationName: String(document.data().organizationName ?? "Workspace"),
  }));
  const organizationId = requestedOrganizationId
    && memberships.some((membership) => membership.organizationId === requestedOrganizationId)
    ? requestedOrganizationId
    : memberships[0]?.organizationId;
  if (!organizationId) return { memberships, organization: null, permissions: [], roleName: null };

  const [organization, member] = await Promise.all([
    db.doc(`organizations/${organizationId}`).get(),
    resolveMemberSnapshot(db, organizationId, user.uid),
  ]);
  if (!organization.exists) return { memberships, organization: null, permissions: [], roleName: null };
  let permissions: Permission[] = [];
  let roleName: string | null = null;
  if (member.exists && member.get("status") === "active") {
    const roleId = String(member.get("roleId") ?? "employee");
    const role = await db.doc(`organizations/${organizationId}/roles/${roleId}`).get();
    if (role.exists) {
      roleName = String(role.get("name") ?? roleId);
      const granted = role.get("permissions");
      permissions = effectiveRolePermissions(roleId, Boolean(role.get("builtIn")), Array.isArray(granted) ? granted : []);
    }
  }
  return {
    memberships,
    organization: { id: organization.id, name: String(organization.get("name") ?? "Workspace") },
    permissions,
    roleName,
  };
}
