import "server-only";

import { roleLabel } from "@/lib/fleet/account/roles";
import { getTeamConfig } from "@/lib/fleet/account/team-config";
import type { MeResponse } from "@/lib/fleet/account/types";
import { productPublicPath } from "@/lib/fleet/routing";

import { getAccountProfile } from "./profiles";
import type { FleetUser } from "./session";
import { listPendingInvitationsForUser } from "./team";
import { listTenantsForUser } from "./tenants";

/** Everything the account menu, workspace switcher and settings page need in one read. */
export async function loadAccount(product: string, user: FleetUser, options: { workspaces?: boolean } = {}): Promise<MeResponse> {
  const withWorkspaces = options.workspaces !== false;
  const config = getTeamConfig(product);
  const [profile, tenants, pendingInvitations] = await Promise.all([
    getAccountProfile(product, user),
    withWorkspaces ? listTenantsForUser(product, user) : Promise.resolve([]),
    withWorkspaces ? listPendingInvitationsForUser(product, user) : Promise.resolve([]),
  ]);
  return {
    profile,
    workspaces: tenants.map((tenant) => ({ ...tenant, roleLabel: roleLabel(config, tenant.role) })),
    pendingInvitations,
  };
}

/** Absolute invitation link for the host the request came in on. */
export function inviteUrlBuilder(request: Request, product: string) {
  const url = new URL(request.url);
  return (token: string) =>
    `${url.origin}${productPublicPath(url.host, product, `/invite/${encodeURIComponent(token)}`, process.env.STANDALONE_PRODUCT)}`;
}
