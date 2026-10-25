import "server-only";

import { tenantRef } from "@/lib/fleet/platform/tenants";

import { loadProgram, TRUST } from "./data";
import { buildPublicTrustCenter, type PublicTrustCenter } from "./model";

const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Unauthenticated read of a tenant's trust center. Returns ONLY the projection admins chose to
 * publish (see buildPublicTrustCenter); returns null for unknown, malformed, or unpublished tenants.
 */
export async function getPublicTrustCenter(tenantId: string): Promise<PublicTrustCenter | null> {
  if (!TENANT_ID.test(tenantId)) return null;
  try {
    const tenant = await tenantRef(TRUST, tenantId).get();
    if (!tenant.exists) return null;
    const program = await loadProgram(tenantId);
    const center = buildPublicTrustCenter(program);
    if (!center) return null;
    return { ...center, displayName: center.displayName || String(tenant.get("name") ?? "Trust center") };
  } catch {
    return null;
  }
}
