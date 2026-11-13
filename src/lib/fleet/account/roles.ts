/**
 * Team roles and the rules for changing them. Pure, so the browser, the server and unit tests
 * share one definition. Each product supplies its own role list (see team-config.ts); "owner"
 * is always the top role and can only change hands through an ownership transfer.
 */

export type RoleOption = {
  id: string;
  label: string;
  description: string;
};

/** Who may see other members' email addresses on the team page. */
export type MemberEmailVisibility = "everyone" | "privileged";

export type TeamConfig = {
  /** Every role a member can hold, highest first. Must include "owner". */
  roles: RoleOption[];
  /** Roles that manage the team: invite, change roles, remove. Always includes "owner". */
  privilegedRoles: string[];
  /** The role preselected in the invite dialog. */
  defaultInviteRole: string;
  memberEmails: MemberEmailVisibility;
};

export const OWNER_ROLE = "owner";

export const DEFAULT_ROLE_OPTIONS: RoleOption[] = [
  { id: "owner", label: "Owner", description: "Full control, including billing-level settings and transferring ownership." },
  { id: "admin", label: "Admin", description: "Manages the team and settings, and can do everything a member can." },
  { id: "member", label: "Member", description: "Creates and edits work in the workspace." },
  { id: "viewer", label: "Viewer", description: "Reads everything they have access to, but cannot change it." },
];

export const DEFAULT_TEAM_CONFIG: TeamConfig = {
  roles: DEFAULT_ROLE_OPTIONS,
  privilegedRoles: ["owner", "admin"],
  defaultInviteRole: "member",
  memberEmails: "everyone",
};

/** Fills gaps in a product's partial configuration and guarantees the owner role exists. */
export function resolveTeamConfig(partial: Partial<TeamConfig> = {}): TeamConfig {
  const roles = partial.roles?.length ? partial.roles : DEFAULT_ROLE_OPTIONS;
  const withOwner = roles.some((role) => role.id === OWNER_ROLE)
    ? roles
    : [DEFAULT_ROLE_OPTIONS[0], ...roles];
  const privileged = new Set([OWNER_ROLE, ...(partial.privilegedRoles ?? DEFAULT_TEAM_CONFIG.privilegedRoles)]);
  const invitable = withOwner.filter((role) => role.id !== OWNER_ROLE);
  const defaultInviteRole = partial.defaultInviteRole && invitable.some((role) => role.id === partial.defaultInviteRole)
    ? partial.defaultInviteRole
    : invitable.find((role) => !privileged.has(role.id))?.id ?? invitable[0]?.id ?? "member";
  return {
    roles: withOwner,
    privilegedRoles: [...privileged],
    defaultInviteRole,
    memberEmails: partial.memberEmails ?? DEFAULT_TEAM_CONFIG.memberEmails,
  };
}

export function isPrivilegedRole(config: TeamConfig, role: string) {
  return config.privilegedRoles.includes(role);
}

/** Roles that can be granted by invitation or role change. Ownership never is. */
export function assignableRoles(config: TeamConfig) {
  return config.roles.filter((role) => role.id !== OWNER_ROLE);
}

export function isAssignableRole(config: TeamConfig, role: string) {
  return assignableRoles(config).some((option) => option.id === role);
}

export function roleLabel(config: TeamConfig, role: string) {
  return config.roles.find((option) => option.id === role)?.label
    ?? (role ? role.charAt(0).toUpperCase() + role.slice(1) : "Member");
}

export type RuleResult =
  | { ok: true }
  | { ok: false; status: number; message: string; code?: string };

const allow: RuleResult = { ok: true };
const deny = (status: number, message: string, code?: string): RuleResult => ({ ok: false, status, message, code });

export type TeamMemberState = { uid: string; role: string; status: string };

function activeOwners(members: TeamMemberState[]) {
  return members.filter((member) => member.status === "active" && member.role === OWNER_ROLE).length;
}

/**
 * Changing someone's role. Only privileged roles may do it; only an owner may change an
 * owner's role; nobody can make someone an owner this way (use transfer); and the last
 * active owner can never be demoted.
 */
export function planRoleChange(
  config: TeamConfig,
  input: { actor: TeamMemberState; target: TeamMemberState; nextRole: string; members: TeamMemberState[] },
): RuleResult {
  const { actor, target, nextRole, members } = input;
  if (actor.status !== "active" || !isPrivilegedRole(config, actor.role)) {
    return deny(403, "Only workspace admins can change roles.");
  }
  if (target.status !== "active") return deny(404, "That person is not a member of this workspace.");
  if (nextRole === OWNER_ROLE) {
    return deny(400, "Ownership can only be transferred, not assigned. Use Transfer ownership instead.");
  }
  if (!isAssignableRole(config, nextRole)) return deny(400, "Choose one of this workspace's roles.");
  if (target.role === OWNER_ROLE && actor.role !== OWNER_ROLE) {
    return deny(403, "Only an owner can change another owner's role.");
  }
  if (target.role === OWNER_ROLE && activeOwners(members) <= 1) {
    return deny(409, "A workspace needs an owner. Transfer ownership to someone else first.", "last_owner");
  }
  return allow;
}

/** Removing someone else. Same guards as a role change; removing yourself is "leave". */
export function planRemoval(
  config: TeamConfig,
  input: { actor: TeamMemberState; target: TeamMemberState; members: TeamMemberState[] },
): RuleResult {
  const { actor, target, members } = input;
  if (actor.uid === target.uid) return deny(400, "To remove yourself, leave the workspace instead.");
  if (actor.status !== "active" || !isPrivilegedRole(config, actor.role)) {
    return deny(403, "Only workspace admins can remove people.");
  }
  if (target.status !== "active") return deny(404, "That person is not a member of this workspace.");
  if (target.role === OWNER_ROLE && actor.role !== OWNER_ROLE) {
    return deny(403, "Only an owner can remove another owner.");
  }
  if (target.role === OWNER_ROLE && activeOwners(members) <= 1) {
    return deny(409, "A workspace needs an owner. Transfer ownership before removing them.", "last_owner");
  }
  return allow;
}

/** Leaving. Anyone may leave, except the last owner, who must hand the workspace over first. */
export function planLeave(input: { actor: TeamMemberState; members: TeamMemberState[] }): RuleResult {
  const { actor, members } = input;
  if (actor.status !== "active") return deny(404, "You are not a member of this workspace.");
  if (actor.role === OWNER_ROLE && activeOwners(members) <= 1) {
    return deny(409, "You are the only owner. Transfer ownership to someone else before you leave.", "last_owner");
  }
  return allow;
}

/** Transferring ownership: an owner hands it to another active member and becomes an admin. */
export function planTransfer(
  config: TeamConfig,
  input: { actor: TeamMemberState; target: TeamMemberState },
): RuleResult {
  const { actor, target } = input;
  if (actor.status !== "active" || actor.role !== OWNER_ROLE) {
    return deny(403, "Only the owner can transfer ownership.");
  }
  if (actor.uid === target.uid) return deny(400, "You already own this workspace.");
  if (target.status !== "active") return deny(404, "That person is not a member of this workspace.");
  if (target.role === OWNER_ROLE) return deny(409, "That person is already an owner.");
  return allow;
}

/** The role a former owner holds after handing ownership over: the highest non-owner privileged role. */
export function roleAfterTransfer(config: TeamConfig) {
  return assignableRoles(config).find((role) => isPrivilegedRole(config, role.id))?.id
    ?? assignableRoles(config)[0]?.id
    ?? "member";
}

/** Role changes that grant or remove management rights need a recent sign-in. */
export function roleChangeNeedsRecentAuth(config: TeamConfig, fromRole: string, toRole: string) {
  return isPrivilegedRole(config, fromRole) || isPrivilegedRole(config, toRole);
}
