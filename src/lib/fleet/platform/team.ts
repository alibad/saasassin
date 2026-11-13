import "server-only";

import { FieldValue, Timestamp, type DocumentData, type Transaction } from "firebase-admin/firestore";

import { maskEmail, normalizeEmail } from "@/lib/fleet/account/identity";
import {
  assignableRoles,
  isAssignableRole,
  isPrivilegedRole,
  OWNER_ROLE,
  planLeave,
  planRemoval,
  planRoleChange,
  planTransfer,
  roleAfterTransfer,
  roleChangeNeedsRecentAuth,
  roleLabel,
  type RuleResult,
  type TeamConfig,
  type TeamMemberState,
} from "@/lib/fleet/account/roles";
import { getTeamConfig } from "@/lib/fleet/account/team-config";
import type {
  CreatedInvitation,
  InvitationView,
  InvitePreview,
  PendingInvitation,
  TeamMemberView,
  TeamView,
} from "@/lib/fleet/account/types";

import {
  createInviteSecret,
  effectiveInvitationStatus,
  formatInviteToken,
  hashInviteSecret,
  INVITATION_TTL_MS,
  inviteEmailKey,
  parseInviteToken,
  verifyInviteSecret,
} from "./invite-token";
import { avatarDataUrl, loadProfiles, profileRef } from "./profiles";
import { FleetError, requireRecentAuth, type FleetUser } from "./session";
import { auditPayload, db, tenantRef, userTenantIndex } from "./tenants";

/**
 * Teams: members joined with their profiles, invitations by email (for people with or without
 * an account), role changes, removal, leaving and ownership transfer. Every change is checked
 * server-side (session -> membership/role -> input -> write) and appends an audit event in the
 * same transaction.
 *
 *   products/{product}/tenants/{tenantId}/invitations/{invitationId}
 *     { email (lowercased), role, tokenHash, invitedBy, status, createdAt, expiresAt, ... }
 *   products/{product}/invitationIndex/{invitationId}            { tenantId }  (resolves link tokens)
 *   products/{product}/invitesByEmail/{sha256(email)}/invitations/{tenantId}_{invitationId}
 *     pending invitations addressed to an email, shown once that email is verified
 */

type BuildInviteUrl = (token: string) => string;

function invitationsRef(product: string, tenantId: string) {
  return tenantRef(product, tenantId).collection("invitations");
}

function invitationIndexRef(product: string, invitationId: string) {
  return db().collection("products").doc(product).collection("invitationIndex").doc(invitationId);
}

function emailLookupRef(product: string, email: string, tenantId: string, invitationId: string) {
  return db()
    .collection("products").doc(product)
    .collection("invitesByEmail").doc(inviteEmailKey(email))
    .collection("invitations").doc(`${tenantId}_${invitationId}`);
}

function millis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return Number(value.toMillis());
  }
  return null;
}

function iso(value: unknown) {
  const ms = millis(value);
  return ms === null ? null : new Date(ms).toISOString();
}

function check(result: RuleResult) {
  if (!result.ok) throw new FleetError(result.message, result.status, result.code);
}

function memberState(data: DocumentData | undefined, uid: string): TeamMemberState {
  return { uid, role: String(data?.role ?? ""), status: String(data?.status ?? "missing") };
}

function actorSummary(actor: FleetUser, name?: string) {
  return { uid: actor.uid, email: actor.email, name: name || actor.name || actor.email.split("@")[0] || "A teammate" };
}

async function displayName(product: string, user: FleetUser) {
  const profile = await profileRef(product, user.uid).get();
  return String(profile.get("name") ?? "") || user.name || user.email.split("@")[0] || "";
}

/** The caller's active membership, or a 404 that reveals nothing about the workspace. */
async function requireActive(product: string, tenantId: string, user: FleetUser) {
  const [tenant, membership] = await Promise.all([
    tenantRef(product, tenantId).get(),
    tenantRef(product, tenantId).collection("memberships").doc(user.uid).get(),
  ]);
  if (!tenant.exists || !membership.exists || membership.get("status") !== "active") {
    throw new FleetError("Workspace not found.", 404);
  }
  return { tenant, role: String(membership.get("role")) };
}

async function requireManager(product: string, tenantId: string, user: FleetUser, config: TeamConfig) {
  const context = await requireActive(product, tenantId, user);
  if (!isPrivilegedRole(config, context.role)) {
    throw new FleetError("Only workspace admins can manage the team.", 403);
  }
  return context;
}

function invitationView(config: TeamConfig, id: string, data: DocumentData): InvitationView {
  const role = String(data.role ?? "");
  return {
    id,
    email: String(data.email ?? ""),
    role,
    roleLabel: roleLabel(config, role),
    status: effectiveInvitationStatus(String(data.status ?? "pending"), millis(data.expiresAt)),
    invitedBy: { uid: String(data.invitedBy?.uid ?? ""), name: String(data.invitedBy?.name ?? "") },
    createdAt: iso(data.createdAt),
    expiresAt: iso(data.expiresAt),
  };
}

/* ---------------------------------------------------------------------------------------- */
/* Reading the team                                                                          */
/* ---------------------------------------------------------------------------------------- */

export async function getTeam(product: string, tenantId: string, viewer: FleetUser): Promise<TeamView> {
  const config = getTeamConfig(product);
  const { tenant, role } = await requireActive(product, tenantId, viewer);
  const canManage = isPrivilegedRole(config, role);

  const membershipSnapshot = await tenant.ref.collection("memberships").get();
  const active = membershipSnapshot.docs.filter((doc) => doc.get("status") === "active");
  const profiles = await loadProfiles(product, active.map((doc) => doc.id));
  const showEveryEmail = config.memberEmails === "everyone" || canManage;
  const order = new Map(config.roles.map((option, index) => [option.id, index]));

  const members: TeamMemberView[] = active.map((doc) => {
    const data = doc.data();
    const profile = profiles.get(doc.id);
    const email = String(data.email ?? "");
    const isYou = doc.id === viewer.uid;
    return {
      uid: doc.id,
      name: profile?.name || String(data.name ?? "") || (showEveryEmail || isYou ? email.split("@")[0] : "") || "Member",
      email: showEveryEmail || isYou ? email || null : null,
      title: profile?.title ?? "",
      role: String(data.role ?? ""),
      roleLabel: roleLabel(config, String(data.role ?? "")),
      photoURL: profile?.photoURL ?? null,
      joinedAt: iso(data.joinedAt),
      isYou,
    };
  }).sort((a, b) =>
    (order.get(a.role) ?? 99) - (order.get(b.role) ?? 99) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  let invitations: InvitationView[] | null = null;
  if (canManage) {
    const pending = await invitationsRef(product, tenantId).where("status", "==", "pending").get();
    invitations = pending.docs
      .map((doc) => invitationView(config, doc.id, doc.data()))
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }

  return {
    workspace: { id: tenant.id, name: String(tenant.get("name") ?? "Workspace") },
    viewer: { uid: viewer.uid, role, roleLabel: roleLabel(config, role), canManage, isOwner: role === OWNER_ROLE },
    roles: config.roles,
    assignableRoles: assignableRoles(config),
    defaultInviteRole: config.defaultInviteRole,
    members,
    invitations,
  };
}

/* ---------------------------------------------------------------------------------------- */
/* Invitations                                                                               */
/* ---------------------------------------------------------------------------------------- */

export async function createInvitation(
  product: string,
  tenantId: string,
  actor: FleetUser,
  input: { email: string; role: string },
  buildInviteUrl: BuildInviteUrl,
): Promise<CreatedInvitation> {
  const config = getTeamConfig(product);
  const email = normalizeEmail(input.email);
  if (input.role === OWNER_ROLE) throw new FleetError("Ownership cannot be granted by invitation.", 403);
  if (!isAssignableRole(config, input.role)) throw new FleetError("Choose one of this workspace's roles.", 400);
  const { tenant } = await requireManager(product, tenantId, actor, config);

  const [memberships, existing] = await Promise.all([
    tenant.ref.collection("memberships").get(),
    invitationsRef(product, tenantId).where("email", "==", email).get(),
  ]);
  if (memberships.docs.some((doc) => doc.get("status") === "active" && normalizeEmail(String(doc.get("email") ?? "")) === email)) {
    throw new FleetError("That person is already a member of this workspace.", 409, "already_member");
  }
  if (existing.docs.some((doc) => effectiveInvitationStatus(String(doc.get("status")), millis(doc.get("expiresAt"))) === "pending")) {
    throw new FleetError("That email already has a pending invitation. Resend it to get a fresh link.", 409, "already_invited");
  }

  const invitation = invitationsRef(product, tenantId).doc();
  const secret = createInviteSecret();
  const expiresAt = Timestamp.fromMillis(Date.now() + INVITATION_TTL_MS);
  const now = FieldValue.serverTimestamp();
  const invitedBy = actorSummary(actor, await displayName(product, actor));
  const workspaceName = String(tenant.get("name") ?? "Workspace");
  const data = {
    email,
    role: input.role,
    tokenHash: hashInviteSecret(secret),
    invitedBy,
    status: "pending",
    workspaceName,
    createdAt: now,
    expiresAt,
    sendCount: 1,
  };

  const batch = db().batch();
  batch.set(invitation, data);
  batch.set(invitationIndexRef(product, invitation.id), { tenantId });
  batch.set(emailLookupRef(product, email, tenantId, invitation.id), {
    tenantId,
    invitationId: invitation.id,
    workspaceName,
    role: input.role,
    invitedByName: invitedBy.name,
    expiresAt,
  });
  batch.set(
    tenant.ref.collection("auditEvents").doc(),
    auditPayload(actor, "invitation.created", { type: "invitation", id: invitation.id }, { email, role: input.role }),
  );
  await batch.commit();

  return {
    invitation: invitationView(config, invitation.id, { ...data, createdAt: Timestamp.now() }),
    inviteUrl: buildInviteUrl(formatInviteToken(invitation.id, secret)),
  };
}

/** Rotates the secret (every earlier link stops working) and restarts the 14-day clock. */
export async function resendInvitation(
  product: string,
  tenantId: string,
  actor: FleetUser,
  invitationId: string,
  buildInviteUrl: BuildInviteUrl,
): Promise<CreatedInvitation> {
  const config = getTeamConfig(product);
  await requireManager(product, tenantId, actor, config);
  const ref = invitationsRef(product, tenantId).doc(invitationId);
  const secret = createInviteSecret();
  const expiresAt = Timestamp.fromMillis(Date.now() + INVITATION_TTL_MS);

  const data = await db().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new FleetError("Invitation not found.", 404);
    const current = snapshot.data() ?? {};
    const status = effectiveInvitationStatus(String(current.status), millis(current.expiresAt));
    if (status === "accepted") throw new FleetError("That invitation has already been accepted.", 409);
    if (status === "revoked") throw new FleetError("That invitation was revoked. Send a new one instead.", 409);
    const updates = {
      tokenHash: hashInviteSecret(secret),
      status: "pending",
      expiresAt,
      resentAt: FieldValue.serverTimestamp(),
      sendCount: Number(current.sendCount ?? 1) + 1,
    };
    transaction.update(ref, updates);
    transaction.set(emailLookupRef(product, String(current.email), tenantId, invitationId), {
      tenantId,
      invitationId,
      workspaceName: String(current.workspaceName ?? ""),
      role: String(current.role),
      invitedByName: String(current.invitedBy?.name ?? ""),
      expiresAt,
    });
    transaction.set(
      tenantRef(product, tenantId).collection("auditEvents").doc(),
      auditPayload(actor, "invitation.resent", { type: "invitation", id: invitationId }, { email: current.email, role: current.role }),
    );
    return { ...current, ...updates };
  });

  return {
    invitation: invitationView(config, invitationId, data),
    inviteUrl: buildInviteUrl(formatInviteToken(invitationId, secret)),
  };
}

export async function revokeInvitation(product: string, tenantId: string, actor: FleetUser, invitationId: string) {
  const config = getTeamConfig(product);
  await requireManager(product, tenantId, actor, config);
  const ref = invitationsRef(product, tenantId).doc(invitationId);
  await db().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new FleetError("Invitation not found.", 404);
    const current = snapshot.data() ?? {};
    if (current.status === "accepted") throw new FleetError("That invitation has already been accepted. Remove the member instead.", 409);
    if (current.status === "revoked") return;
    transaction.update(ref, {
      status: "revoked",
      revokedBy: { uid: actor.uid, email: actor.email },
      revokedAt: FieldValue.serverTimestamp(),
    });
    transaction.delete(emailLookupRef(product, String(current.email), tenantId, invitationId));
    transaction.set(
      tenantRef(product, tenantId).collection("auditEvents").doc(),
      auditPayload(actor, "invitation.revoked", { type: "invitation", id: invitationId }, { email: current.email, role: current.role }),
    );
  });
}

/** Why an invitation cannot be accepted right now, as a stable code the invite page can show. */
function acceptanceProblem(invitation: DocumentData, user: FleetUser): { status: number; message: string; code: string } | null {
  const status = effectiveInvitationStatus(String(invitation.status), millis(invitation.expiresAt));
  if (status === "revoked") return { status: 410, code: "revoked", message: "This invitation was revoked. Ask for a new one." };
  if (status === "expired") return { status: 410, code: "expired", message: "This invitation has expired. Ask for a new one." };
  if (status === "accepted") {
    return invitation.acceptedBy?.uid === user.uid
      ? null
      : { status: 410, code: "used", message: "This invitation has already been used." };
  }
  if (!user.email || normalizeEmail(user.email) !== invitation.email) {
    return { status: 403, code: "wrong_email", message: "This invitation was sent to a different email address." };
  }
  if (!user.emailVerified) {
    return { status: 403, code: "verify_email", message: "Verify your email address to accept this invitation." };
  }
  return null;
}

async function acceptInTransaction(
  transaction: Transaction,
  product: string,
  tenantId: string,
  invitationId: string,
  user: FleetUser,
  name: string,
  verifySecret: ((invitation: DocumentData) => boolean) | null,
) {
  const config = getTeamConfig(product);
  const invitationRef = invitationsRef(product, tenantId).doc(invitationId);
  const membershipRef = tenantRef(product, tenantId).collection("memberships").doc(user.uid);
  const [invitation, tenant, membership] = await Promise.all([
    transaction.get(invitationRef),
    transaction.get(tenantRef(product, tenantId)),
    transaction.get(membershipRef),
  ]);
  const data = invitation.data();
  if (!invitation.exists || !data || !tenant.exists || (verifySecret && !verifySecret(data))) {
    throw new FleetError("This invitation link is not valid.", 404, "invalid");
  }
  const problem = acceptanceProblem(data, user);
  if (problem) throw new FleetError(problem.message, problem.status, problem.code);

  const workspaceName = String(tenant.get("name") ?? "Workspace");
  const role = String(data.role);
  const result = { tenantId, workspaceName, role, roleLabel: roleLabel(config, role) };
  if (data.status === "accepted") return { ...result, alreadyMember: true };

  const now = FieldValue.serverTimestamp();
  const alreadyMember = membership.exists && membership.get("status") === "active";
  transaction.update(invitationRef, {
    status: "accepted",
    acceptedBy: { uid: user.uid, email: normalizeEmail(user.email) },
    acceptedAt: now,
  });
  transaction.delete(emailLookupRef(product, String(data.email), tenantId, invitationId));
  if (!alreadyMember) {
    transaction.set(membershipRef, {
      uid: user.uid,
      email: normalizeEmail(user.email),
      name,
      role,
      status: "active",
      joinedAt: now,
      invitedBy: { uid: String(data.invitedBy?.uid ?? ""), invitationId },
    });
    transaction.set(userTenantIndex(product, user.uid, tenantId), { name: workspaceName, role, joinedAt: now });
  }
  transaction.set(
    tenantRef(product, tenantId).collection("auditEvents").doc(),
    auditPayload(user, "invitation.accepted", { type: "invitation", id: invitationId }, {
      role: alreadyMember ? String(membership.get("role")) : role,
      alreadyMember,
    }),
  );
  return { ...result, alreadyMember };
}

/** Accepts with the secret from an invitation link. The signed-in, verified email must match. */
export async function acceptInvitationByToken(product: string, user: FleetUser, token: string) {
  const parsed = parseInviteToken(token);
  if (!parsed) throw new FleetError("This invitation link is not valid.", 404, "invalid");
  const index = await invitationIndexRef(product, parsed.invitationId).get();
  const tenantId = index.exists ? String(index.get("tenantId") ?? "") : "";
  if (!tenantId) throw new FleetError("This invitation link is not valid.", 404, "invalid");
  const name = await displayName(product, user);
  return db().runTransaction((transaction) =>
    acceptInTransaction(transaction, product, tenantId, parsed.invitationId, user, name,
      (invitation) => verifyInviteSecret(parsed.secret, String(invitation.tokenHash ?? ""))));
}

/** Accepts an invitation addressed to the signed-in person's verified email (no link needed). */
export async function acceptInvitationForEmail(product: string, user: FleetUser, tenantId: string, invitationId: string) {
  const name = await displayName(product, user);
  return db().runTransaction((transaction) =>
    acceptInTransaction(transaction, product, tenantId, invitationId, user, name, null));
}

/** Pending invitations addressed to the signed-in email. Nothing until that email is verified. */
export async function listPendingInvitationsForUser(product: string, user: FleetUser): Promise<PendingInvitation[]> {
  if (!user.emailVerified || !user.email) return [];
  const config = getTeamConfig(product);
  const email = normalizeEmail(user.email);
  const [lookups, memberOf] = await Promise.all([
    db().collection("products").doc(product).collection("invitesByEmail").doc(inviteEmailKey(email)).collection("invitations").get(),
    profileRef(product, user.uid).collection("tenants").get(),
  ]);
  const joined = new Set(memberOf.docs.map((doc) => doc.id));
  const now = Date.now();
  return lookups.docs
    .map((doc) => doc.data())
    .filter((data) => !joined.has(String(data.tenantId)))
    .filter((data) => effectiveInvitationStatus("pending", millis(data.expiresAt), now) === "pending")
    .map((data) => ({
      tenantId: String(data.tenantId),
      invitationId: String(data.invitationId),
      workspaceName: String(data.workspaceName ?? "Workspace"),
      role: String(data.role),
      roleLabel: roleLabel(config, String(data.role)),
      invitedByName: String(data.invitedByName ?? ""),
      expiresAt: iso(data.expiresAt),
    }))
    .sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));
}

/**
 * What the invite page shows for a link: workspace, inviter, role and the state the viewer is
 * in. A malformed or wrong secret is always "invalid", never a hint that the invitation exists.
 */
export async function previewInvitation(product: string, token: string, viewer: FleetUser | null): Promise<InvitePreview> {
  const config = getTeamConfig(product);
  const invalid: InvitePreview = {
    state: "invalid", tenantId: null, workspaceName: null, inviter: null, role: null,
    invitedEmail: null, viewerEmail: viewer?.email ?? null, expiresAt: null,
  };
  const parsed = parseInviteToken(token);
  if (!parsed) return invalid;
  const index = await invitationIndexRef(product, parsed.invitationId).get();
  const tenantId = index.exists ? String(index.get("tenantId") ?? "") : "";
  if (!tenantId) return invalid;
  const [invitation, tenant] = await Promise.all([
    invitationsRef(product, tenantId).doc(parsed.invitationId).get(),
    tenantRef(product, tenantId).get(),
  ]);
  const data = invitation.data();
  if (!data || !tenant.exists || !verifyInviteSecret(parsed.secret, String(data.tokenHash ?? ""))) return invalid;

  const inviterUid = String(data.invitedBy?.uid ?? "");
  const [inviterProfile, inviterUpload] = await Promise.all([
    inviterUid ? profileRef(product, inviterUid).get() : null,
    inviterUid ? avatarDataUrl(product, inviterUid) : null,
  ]);
  const inviterPhoto = inviterUpload
    ?? (inviterProfile?.get("photo.source") === "provider" ? (inviterProfile.get("providerPhotoURL") as string | null) ?? null : null);
  const role = String(data.role);
  const base: InvitePreview = {
    state: "ready",
    tenantId,
    workspaceName: String(tenant.get("name") ?? "Workspace"),
    inviter: {
      name: String(inviterProfile?.get("name") ?? "") || String(data.invitedBy?.name ?? "") || "A teammate",
      photoURL: inviterPhoto,
    },
    role: config.roles.find((option) => option.id === role) ?? { id: role, label: roleLabel(config, role), description: "" },
    invitedEmail: maskEmail(String(data.email ?? "")),
    viewerEmail: viewer?.email ?? null,
    expiresAt: iso(data.expiresAt),
  };

  const status = effectiveInvitationStatus(String(data.status), millis(data.expiresAt));
  if (status === "revoked") return { ...base, state: "revoked" };
  if (status === "expired") return { ...base, state: "expired" };
  if (status === "accepted") {
    return { ...base, state: viewer && data.acceptedBy?.uid === viewer.uid ? "already_member" : "used" };
  }
  if (!viewer) return { ...base, state: "signed_out" };
  if (normalizeEmail(viewer.email) !== data.email) return { ...base, state: "wrong_email" };
  if (!viewer.emailVerified) return { ...base, state: "verify_email" };
  const membership = await tenantRef(product, tenantId).collection("memberships").doc(viewer.uid).get();
  if (membership.exists && membership.get("status") === "active") return { ...base, state: "already_member" };
  return base;
}

/* ---------------------------------------------------------------------------------------- */
/* Members                                                                                   */
/* ---------------------------------------------------------------------------------------- */

async function readMembers(transaction: Transaction, product: string, tenantId: string) {
  const snapshot = await transaction.get(tenantRef(product, tenantId).collection("memberships"));
  const members = snapshot.docs.map((doc) => memberState(doc.data(), doc.id));
  const byUid = new Map(members.map((member) => [member.uid, member]));
  return { members, get: (uid: string) => byUid.get(uid) ?? memberState(undefined, uid) };
}

export async function changeMemberRole(product: string, tenantId: string, actor: FleetUser, targetUid: string, nextRole: string) {
  const config = getTeamConfig(product);
  const tenant = await tenantRef(product, tenantId).get();
  if (!tenant.exists) throw new FleetError("Workspace not found.", 404);
  const workspaceName = String(tenant.get("name") ?? "Workspace");
  return db().runTransaction(async (transaction) => {
    const { members, get } = await readMembers(transaction, product, tenantId);
    const actorState = get(actor.uid);
    if (actorState.status !== "active") throw new FleetError("Workspace not found.", 404);
    const target = get(targetUid);
    check(planRoleChange(config, { actor: actorState, target, nextRole, members }));
    if (target.role === nextRole) return { uid: targetUid, role: nextRole, roleLabel: roleLabel(config, nextRole) };
    if (roleChangeNeedsRecentAuth(config, target.role, nextRole)) requireRecentAuth(actor);

    const memberships = tenantRef(product, tenantId).collection("memberships");
    transaction.update(memberships.doc(targetUid), { role: nextRole, roleChangedAt: FieldValue.serverTimestamp() });
    transaction.set(userTenantIndex(product, targetUid, tenantId), { name: workspaceName, role: nextRole }, { merge: true });
    transaction.set(
      tenantRef(product, tenantId).collection("auditEvents").doc(),
      auditPayload(actor, "membership.role_changed", { type: "membership", id: targetUid }, { from: target.role, to: nextRole }),
    );
    return { uid: targetUid, role: nextRole, roleLabel: roleLabel(config, nextRole) };
  });
}

function endMembership(
  transaction: Transaction,
  product: string,
  tenantId: string,
  uid: string,
  actor: FleetUser,
  reason: "removed" | "left",
) {
  transaction.update(tenantRef(product, tenantId).collection("memberships").doc(uid), {
    status: "removed",
    removedAt: FieldValue.serverTimestamp(),
    removedBy: { uid: actor.uid, email: actor.email },
    removedReason: reason,
  });
  transaction.delete(userTenantIndex(product, uid, tenantId));
}

export async function removeMember(product: string, tenantId: string, actor: FleetUser, targetUid: string) {
  const config = getTeamConfig(product);
  const tenant = await tenantRef(product, tenantId).get();
  if (!tenant.exists) throw new FleetError("Workspace not found.", 404);
  await db().runTransaction(async (transaction) => {
    const { members, get } = await readMembers(transaction, product, tenantId);
    const actorState = get(actor.uid);
    if (actorState.status !== "active") throw new FleetError("Workspace not found.", 404);
    const target = get(targetUid);
    check(planRemoval(config, { actor: actorState, target, members }));
    endMembership(transaction, product, tenantId, targetUid, actor, "removed");
    transaction.set(
      tenantRef(product, tenantId).collection("auditEvents").doc(),
      auditPayload(actor, "membership.removed", { type: "membership", id: targetUid }, { role: target.role }),
    );
  });
}

export async function leaveTenant(product: string, tenantId: string, actor: FleetUser) {
  const tenant = await tenantRef(product, tenantId).get();
  if (!tenant.exists) throw new FleetError("Workspace not found.", 404);
  await db().runTransaction(async (transaction) => {
    const { members, get } = await readMembers(transaction, product, tenantId);
    const actorState = get(actor.uid);
    if (actorState.status !== "active") throw new FleetError("Workspace not found.", 404);
    check(planLeave({ actor: actorState, members }));
    endMembership(transaction, product, tenantId, actor.uid, actor, "left");
    transaction.set(
      tenantRef(product, tenantId).collection("auditEvents").doc(),
      auditPayload(actor, "membership.left", { type: "membership", id: actor.uid }, { role: actorState.role }),
    );
  });
}

/** The owner hands ownership to another active member and becomes an admin. Needs a recent sign-in. */
export async function transferOwnership(product: string, tenantId: string, actor: FleetUser, targetUid: string) {
  const config = getTeamConfig(product);
  const tenant = await tenantRef(product, tenantId).get();
  if (!tenant.exists) throw new FleetError("Workspace not found.", 404);
  const workspaceName = String(tenant.get("name") ?? "Workspace");
  return db().runTransaction(async (transaction) => {
    const { get } = await readMembers(transaction, product, tenantId);
    const actorState = get(actor.uid);
    if (actorState.status !== "active") throw new FleetError("Workspace not found.", 404);
    const target = get(targetUid);
    check(planTransfer(config, { actor: actorState, target }));
    requireRecentAuth(actor);

    const previousOwnerRole = roleAfterTransfer(config);
    const memberships = tenantRef(product, tenantId).collection("memberships");
    const now = FieldValue.serverTimestamp();
    transaction.update(memberships.doc(targetUid), { role: OWNER_ROLE, roleChangedAt: now });
    transaction.update(memberships.doc(actor.uid), { role: previousOwnerRole, roleChangedAt: now });
    transaction.set(userTenantIndex(product, targetUid, tenantId), { name: workspaceName, role: OWNER_ROLE }, { merge: true });
    transaction.set(userTenantIndex(product, actor.uid, tenantId), { name: workspaceName, role: previousOwnerRole }, { merge: true });
    transaction.set(
      tenantRef(product, tenantId).collection("auditEvents").doc(),
      auditPayload(actor, "ownership.transferred", { type: "membership", id: targetUid }, {
        from: actor.uid,
        to: targetUid,
        previousOwnerRole,
      }),
    );
    return { owner: targetUid, yourRole: previousOwnerRole, yourRoleLabel: roleLabel(config, previousOwnerRole) };
  });
}
