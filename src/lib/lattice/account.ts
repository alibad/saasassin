import "server-only";

import { LATTICE_SESSION_COOKIE } from "@/lib/lattice/auth";
import { requireDb, resolveMemberSnapshot } from "@/lib/lattice/data";
import type { AccountContext } from "@/lib/fleet/platform/account-routes";
import { FleetError, readSessionCookieUser } from "@/lib/fleet/platform/session";

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
