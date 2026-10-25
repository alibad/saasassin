import { getAdminAuth } from "@/lib/firebase/admin";
import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError, requireFleetUser } from "@/lib/fleet/platform/session";
import { requireTenantMember } from "@/lib/fleet/platform/tenants";
import { CREATOR_SLUG, bulkEnrollSchema, parseEmailList } from "@/lib/creator/model";
import { PUBLISHER_ROLES } from "@/lib/creator/roles";
import { bulkEnroll } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string; courseId: string }> };

/** Bulk-enroll existing SaaSassin accounts by email; never creates accounts. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, courseId } = await params;
    const user = await requireFleetUser(CREATOR_SLUG);
    await requireTenantMember(CREATOR_SLUG, tenantId, user, PUBLISHER_ROLES);
    const { emails } = bulkEnrollSchema.parse(await request.json());
    const { valid, invalid } = parseEmailList(emails);
    if (valid.length === 0) throw new FleetError("No valid email addresses found.", 400);
    if (valid.length > 200) throw new FleetError("Enroll at most 200 people at a time.", 400);
    const auth = getAdminAuth();
    if (!auth) throw new FleetError("Authentication is not configured.", 503);
    const result = await bulkEnroll(tenantId, user, courseId, valid, async (email) => {
      const account = await auth.getUserByEmail(email).catch(() => null);
      return account ? { uid: account.uid, email: account.email ?? email, name: account.displayName ?? "" } : null;
    });
    return Response.json({ ...result, invalid });
  } catch (error) {
    return fleetApiError(error);
  }
}
