import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Shared accounts and teams against the Firestore (and, when running, Auth) emulators.
// Never runs against production:
//   firebase emulators:exec --only firestore,auth --project demo-saasassin \
//     "pnpm exec vitest run --config vitest.emulator.config.mjs tests/fleet-team.emulator.spec.ts"
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("fleet-team.emulator.spec.ts only runs under the Firestore emulator (FIRESTORE_EMULATOR_HOST is not set).");
}
process.env.FIREBASE_PROJECT_ID = "demo-saasassin";
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "";

const app = initializeApp({ projectId: "demo-saasassin" }, "fleet-team");
const db: Firestore = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });
const auth: Auth | null = authEmulatorHost ? getAuth(app) : null;

vi.mock("@/lib/firebase/admin", () => ({
  getAdminDb: () => db,
  getAdminAuth: () => auth,
  isFirebaseConfigured: () => true,
}));

const tenants = await import("@/lib/fleet/platform/tenants");
const team = await import("@/lib/fleet/platform/team");
const profiles = await import("@/lib/fleet/platform/profiles");
const { loadAccount } = await import("@/lib/fleet/platform/account");
const { getAvatar } = await import("@/lib/fleet/platform/account-routes");
const { FleetError, fleetUserFromClaims } = await import("@/lib/fleet/platform/session");
type FleetUser = import("@/lib/fleet/platform/session").FleetUser;

const PRODUCT = "planner";
const run = Date.now().toString(36);
const nowSeconds = () => Math.floor(Date.now() / 1000);

function person(key: string, name: string): FleetUser {
  return { uid: `team-${key}-${run}`, email: `${key}.${run}@team.example`, name, emailVerified: true, authTime: nowSeconds() };
}
const fresh = (user: FleetUser): FleetUser => ({ ...user, authTime: nowSeconds() });
const stale = (user: FleetUser): FleetUser => ({ ...user, authTime: nowSeconds() - 3600 });

const owner = person("owner", "Olive Owner");
const admin = person("admin", "Adam Admin");
const teammate = person("mate", "Mia Mate");
const stranger = person("stranger", "Stan Stranger");

const inviteUrl = (token: string) => `https://planner.saasassin.net/invite/${token}`;
const tokenOf = (url: string) => decodeURIComponent(url.split("/invite/")[1] ?? "");

let tenantId = "";

async function expectFleetError(promise: Promise<unknown>, status: number, code?: string) {
  const error = await promise.then(() => null, (cause: unknown) => cause);
  expect(error).toBeInstanceOf(FleetError);
  expect((error as InstanceType<typeof FleetError>).status).toBe(status);
  if (code) expect((error as InstanceType<typeof FleetError>).code).toBe(code);
}

async function membership(uid: string, tenant = tenantId) {
  return (await db.doc(`products/${PRODUCT}/tenants/${tenant}/memberships/${uid}`).get()).data();
}

async function auditActions(tenant = tenantId) {
  const snapshot = await db.collection(`products/${PRODUCT}/tenants/${tenant}/auditEvents`).get();
  return snapshot.docs.map((doc) => String(doc.get("action")));
}

/**
 * Signs a brand-new person up. With the Auth emulator this is a real email/password sign-up,
 * a verified email, and a session cookie verified (with revocation checks) exactly as the
 * product session route and getFleetUser do. Without it, the same claims are built directly.
 */
async function signUp(email: string, options: { verified: boolean }) {
  if (!auth) {
    return {
      user: fleetUserFromClaims({ uid: `team-signup-${email}`, email, email_verified: options.verified, auth_time: nowSeconds() }),
      cookie: null as string | null,
    };
  }
  const endpoint = (method: string) => `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:${method}?key=demo-key`;
  const password = `pw-${run}-secure`;
  const created = await fetch(endpoint("signUp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }).then((response) => response.json()) as { localId: string };
  if (options.verified) await auth.updateUser(created.localId, { emailVerified: true });
  const signedIn = await fetch(endpoint("signInWithPassword"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }).then((response) => response.json()) as { idToken: string };
  const cookie = await auth.createSessionCookie(signedIn.idToken, { expiresIn: 60 * 60 * 1000 });
  return { user: fleetUserFromClaims(await auth.verifySessionCookie(cookie, true)), cookie };
}

beforeAll(async () => {
  tenantId = (await tenants.createTenant(PRODUCT, owner, "Acme Planning")).id;
  await tenants.grantMembership(PRODUCT, tenantId, owner, admin, "admin");
  await tenants.grantMembership(PRODUCT, tenantId, owner, teammate, "member");
});

afterAll(async () => {
  await Promise.all(getApps().map((existing) => deleteApp(existing)));
});

describe("invitations (emulator)", () => {
  it("invites someone without an account, who sees and accepts it once their email is verified", async () => {
    const email = `New.Hire.${run}@Example.com`;
    const created = await team.createInvitation(PRODUCT, tenantId, owner, { email, role: "member" }, inviteUrl);
    expect(created.invitation).toMatchObject({ email: email.toLowerCase(), role: "member", status: "pending", invitedBy: { name: "Olive Owner" } });
    expect(created.inviteUrl).toMatch(/^https:\/\/planner\.saasassin\.net\/invite\/[A-Za-z0-9]+\.[A-Za-z0-9_-]{43}$/);

    // Only a hash of the link secret is stored.
    const secret = tokenOf(created.inviteUrl).split(".")[1];
    const stored = (await db.doc(`products/${PRODUCT}/tenants/${tenantId}/invitations/${created.invitation.id}`).get()).data();
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect(stored?.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    // The team page shows it to privileged roles only.
    expect((await team.getTeam(PRODUCT, tenantId, owner)).invitations?.map((invitation) => invitation.id)).toContain(created.invitation.id);
    expect((await team.getTeam(PRODUCT, tenantId, teammate)).invitations).toBeNull();

    // Unverified: nothing is offered and email-match acceptance is refused.
    const unverified = await signUp(`new.hire.${run}@example.com`, { verified: false });
    expect(unverified.user.emailVerified).toBe(false);
    expect(await team.listPendingInvitationsForUser(PRODUCT, unverified.user)).toEqual([]);
    await expectFleetError(team.acceptInvitationForEmail(PRODUCT, unverified.user, tenantId, created.invitation.id), 403, "verify_email");

    // Verified: the invitation shows up in their account and they can join.
    const verified = auth
      ? fleetUserFromClaims(await auth.verifySessionCookie(await (async () => {
        await auth.updateUser(unverified.user.uid, { emailVerified: true });
        return (await signUpAgain(unverified.user.email)).cookie;
      })(), true))
      : { ...unverified.user, emailVerified: true };
    expect(verified.emailVerified).toBe(true);
    const account = await loadAccount(PRODUCT, verified);
    expect(account.pendingInvitations).toEqual([
      expect.objectContaining({ tenantId, invitationId: created.invitation.id, workspaceName: "Acme Planning", role: "member", roleLabel: "Member" }),
    ]);

    const accepted = await team.acceptInvitationForEmail(PRODUCT, verified, tenantId, created.invitation.id);
    expect(accepted).toMatchObject({ tenantId, workspaceName: "Acme Planning", role: "member", alreadyMember: false });
    await expect(tenants.requireTenantMember(PRODUCT, tenantId, verified)).resolves.toMatchObject({ role: "member" });
    const after = await loadAccount(PRODUCT, verified);
    expect(after.pendingInvitations).toEqual([]);
    expect(after.workspaces.map((workspace) => workspace.id)).toContain(tenantId);
    // Accepting twice is harmless.
    await expect(team.acceptInvitationForEmail(PRODUCT, verified, tenantId, created.invitation.id)).resolves.toMatchObject({ alreadyMember: true });
  });

  it("accepts with the link token, and only with the right secret", async () => {
    const email = `link.${run}@example.com`;
    const created = await team.createInvitation(PRODUCT, tenantId, admin, { email, role: "viewer" }, inviteUrl);
    const token = tokenOf(created.inviteUrl);
    const tampered = `${token.split(".")[0]}.${"A".repeat(43)}`;

    const signedOut = await team.previewInvitation(PRODUCT, token, null);
    expect(signedOut).toMatchObject({
      state: "signed_out",
      tenantId,
      workspaceName: "Acme Planning",
      inviter: { name: "Adam Admin" },
      role: { id: "viewer", label: "Viewer" },
      invitedEmail: `l•••@example.com`,
    });
    expect((await team.previewInvitation(PRODUCT, tampered, null)).state).toBe("invalid");
    expect((await team.previewInvitation(PRODUCT, "garbage", null)).state).toBe("invalid");

    const { user } = await signUp(email, { verified: true });
    expect((await team.previewInvitation(PRODUCT, token, user)).state).toBe("ready");
    await expectFleetError(team.acceptInvitationByToken(PRODUCT, user, tampered), 404, "invalid");
    await expect(team.acceptInvitationByToken(PRODUCT, user, token)).resolves.toMatchObject({ tenantId, role: "viewer" });
    await expect(tenants.requireTenantMember(PRODUCT, tenantId, user)).resolves.toMatchObject({ role: "viewer" });
    expect((await team.previewInvitation(PRODUCT, token, user)).state).toBe("already_member");
    // A used link is spent for everyone else.
    await expectFleetError(team.acceptInvitationByToken(PRODUCT, stranger, token), 410, "used");
  });

  it("blocks revoked, expired and wrong-email invitations, and rotates links on resend", async () => {
    // Revoked.
    const revokedEmail = `revoked.${run}@example.com`;
    const revoked = await team.createInvitation(PRODUCT, tenantId, owner, { email: revokedEmail, role: "member" }, inviteUrl);
    await expectFleetError(team.revokeInvitation(PRODUCT, tenantId, teammate, revoked.invitation.id), 403);
    await team.revokeInvitation(PRODUCT, tenantId, owner, revoked.invitation.id);
    const revokedUser = (await signUp(revokedEmail, { verified: true })).user;
    await expectFleetError(team.acceptInvitationByToken(PRODUCT, revokedUser, tokenOf(revoked.inviteUrl)), 410, "revoked");
    expect((await team.previewInvitation(PRODUCT, tokenOf(revoked.inviteUrl), revokedUser)).state).toBe("revoked");
    expect(await team.listPendingInvitationsForUser(PRODUCT, revokedUser)).toEqual([]);
    await expectFleetError(team.resendInvitation(PRODUCT, tenantId, owner, revoked.invitation.id, inviteUrl), 409);

    // Expired.
    const expiredEmail = `expired.${run}@example.com`;
    const expired = await team.createInvitation(PRODUCT, tenantId, owner, { email: expiredEmail, role: "member" }, inviteUrl);
    await db.doc(`products/${PRODUCT}/tenants/${tenantId}/invitations/${expired.invitation.id}`)
      .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    const lookups = await db.collectionGroup("invitations").where("invitationId", "==", expired.invitation.id).get();
    await Promise.all(lookups.docs.map((doc) => doc.ref.update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) })));
    const expiredUser = (await signUp(expiredEmail, { verified: true })).user;
    await expectFleetError(team.acceptInvitationByToken(PRODUCT, expiredUser, tokenOf(expired.inviteUrl)), 410, "expired");
    await expectFleetError(team.acceptInvitationForEmail(PRODUCT, expiredUser, tenantId, expired.invitation.id), 410, "expired");
    expect((await team.previewInvitation(PRODUCT, tokenOf(expired.inviteUrl), expiredUser)).state).toBe("expired");
    expect(await team.listPendingInvitationsForUser(PRODUCT, expiredUser)).toEqual([]);
    expect((await team.getTeam(PRODUCT, tenantId, owner)).invitations?.find((invitation) => invitation.id === expired.invitation.id)?.status).toBe("expired");

    // Resend: a new link works, the old one no longer does.
    const resent = await team.resendInvitation(PRODUCT, tenantId, owner, expired.invitation.id, inviteUrl);
    expect(resent.invitation.status).toBe("pending");
    expect(tokenOf(resent.inviteUrl)).not.toBe(tokenOf(expired.inviteUrl));
    await expectFleetError(team.acceptInvitationByToken(PRODUCT, expiredUser, tokenOf(expired.inviteUrl)), 404, "invalid");
    await expect(team.acceptInvitationByToken(PRODUCT, expiredUser, tokenOf(resent.inviteUrl))).resolves.toMatchObject({ tenantId });

    // Wrong email.
    const wrong = await team.createInvitation(PRODUCT, tenantId, owner, { email: `right.${run}@example.com`, role: "member" }, inviteUrl);
    const wrongUser = (await signUp(`wrong.${run}@example.com`, { verified: true })).user;
    expect((await team.previewInvitation(PRODUCT, tokenOf(wrong.inviteUrl), wrongUser)).state).toBe("wrong_email");
    await expectFleetError(team.acceptInvitationByToken(PRODUCT, wrongUser, tokenOf(wrong.inviteUrl)), 403, "wrong_email");
    await expectFleetError(tenants.requireTenantMember(PRODUCT, tenantId, wrongUser), 404);
  });

  it("refuses duplicate, already-member and ownership invitations, and non-admins", async () => {
    await expectFleetError(team.createInvitation(PRODUCT, tenantId, owner, { email: teammate.email.toUpperCase(), role: "member" }, inviteUrl), 409, "already_member");
    const email = `twice.${run}@example.com`;
    await team.createInvitation(PRODUCT, tenantId, owner, { email, role: "member" }, inviteUrl);
    await expectFleetError(team.createInvitation(PRODUCT, tenantId, owner, { email, role: "viewer" }, inviteUrl), 409, "already_invited");
    await expectFleetError(team.createInvitation(PRODUCT, tenantId, owner, { email: `boss.${run}@example.com`, role: "owner" }, inviteUrl), 403);
    await expectFleetError(team.createInvitation(PRODUCT, tenantId, owner, { email: `odd.${run}@example.com`, role: "superuser" }, inviteUrl), 400);
    await expectFleetError(team.createInvitation(PRODUCT, tenantId, teammate, { email: `sneaky.${run}@example.com`, role: "member" }, inviteUrl), 403);
    await expectFleetError(team.createInvitation(PRODUCT, tenantId, stranger, { email: `sneaky2.${run}@example.com`, role: "member" }, inviteUrl), 404);
  });
});

describe("members (emulator)", () => {
  it("changes roles, protecting the last owner and asking for a recent sign-in for admin rights", async () => {
    await expectFleetError(team.changeMemberRole(PRODUCT, tenantId, stale(owner), teammate.uid, "admin"), 403, "reauth_required");
    await expect(team.changeMemberRole(PRODUCT, tenantId, stale(owner), teammate.uid, "viewer")).resolves.toMatchObject({ role: "viewer" });
    await expect(team.changeMemberRole(PRODUCT, tenantId, fresh(owner), teammate.uid, "admin")).resolves.toMatchObject({ role: "admin" });
    await expect(team.changeMemberRole(PRODUCT, tenantId, fresh(owner), teammate.uid, "member")).resolves.toMatchObject({ role: "member" });
    expect((await db.doc(`products/${PRODUCT}/users/${teammate.uid}/tenants/${tenantId}`).get()).get("role")).toBe("member");

    await expectFleetError(team.changeMemberRole(PRODUCT, tenantId, fresh(teammate), admin.uid, "viewer"), 403);
    await expectFleetError(team.changeMemberRole(PRODUCT, tenantId, fresh(owner), teammate.uid, "owner"), 400);
    await expectFleetError(team.changeMemberRole(PRODUCT, tenantId, fresh(admin), owner.uid, "member"), 403);
    await expectFleetError(team.changeMemberRole(PRODUCT, tenantId, fresh(owner), owner.uid, "admin"), 409, "last_owner");
    await expectFleetError(team.removeMember(PRODUCT, tenantId, fresh(admin), owner.uid), 403);
    await expectFleetError(team.removeMember(PRODUCT, tenantId, fresh(owner), owner.uid), 400);
    await expectFleetError(team.leaveTenant(PRODUCT, tenantId, owner), 409, "last_owner");
    expect((await membership(owner.uid))?.role).toBe("owner");
  });

  it("transfers ownership, after which the previous owner can leave", async () => {
    await expectFleetError(team.transferOwnership(PRODUCT, tenantId, stale(owner), admin.uid), 403, "reauth_required");
    await expectFleetError(team.transferOwnership(PRODUCT, tenantId, fresh(admin), teammate.uid), 403);
    await expect(team.transferOwnership(PRODUCT, tenantId, fresh(owner), admin.uid)).resolves.toMatchObject({ owner: admin.uid, yourRole: "admin" });
    expect((await membership(admin.uid))?.role).toBe("owner");
    expect((await membership(owner.uid))?.role).toBe("admin");
    expect((await db.doc(`products/${PRODUCT}/users/${admin.uid}/tenants/${tenantId}`).get()).get("role")).toBe("owner");

    await team.leaveTenant(PRODUCT, tenantId, owner);
    expect((await membership(owner.uid))?.status).toBe("removed");
    expect((await db.doc(`products/${PRODUCT}/users/${owner.uid}/tenants/${tenantId}`).get()).exists).toBe(false);
    await expectFleetError(tenants.requireTenantMember(PRODUCT, tenantId, owner), 404);
    expect((await tenants.listTenantsForUser(PRODUCT, owner)).map((tenant) => tenant.id)).not.toContain(tenantId);
  });
});

describe("profiles and avatars (emulator)", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const context = (viewer: FleetUser) => ({
    product: PRODUCT,
    user: viewer,
    workspaces: true,
    canViewAvatar: (viewerUid: string, subjectUid: string) => profiles.sharesActiveTenant(PRODUCT, viewerUid, subjectUid),
    sessionCookie: `saasassin_${PRODUCT}_session`,
  });

  it("keeps the provider photo unless the person chose otherwise", async () => {
    const withPhoto = { ...teammate, picture: "https://lh3.googleusercontent.com/a/photo" };
    const profile = await profiles.getAccountProfile(PRODUCT, withPhoto);
    expect(profile).toMatchObject({ photoSource: "provider", photoURL: withPhoto.picture, providerPhotoURL: withPhoto.picture });
    const none = await profiles.updateAccountProfile(PRODUCT, withPhoto, { photoSource: "none", name: "Mia M. Mate", title: "Planner" });
    expect(none).toMatchObject({ photoSource: "none", photoURL: null, name: "Mia M. Mate", title: "Planner" });
    expect((await profiles.getAccountProfile(PRODUCT, withPhoto)).photoSource).toBe("none");
    // The name follows onto memberships read by older product screens.
    expect((await membership(teammate.uid))?.name).toBe("Mia M. Mate");
    await expectFleetError(profiles.updateAccountProfile(PRODUCT, stranger, { photoSource: "provider" }), 400);
  });

  it("serves an uploaded photo to teammates and a 404 to everyone else", async () => {
    await expectFleetError(profiles.setUploadedPhoto(PRODUCT, teammate, svg), 415);
    const first = await profiles.setUploadedPhoto(PRODUCT, teammate, png);
    expect(first.photoSource).toBe("upload");
    expect(first.photoURL).toMatch(new RegExp(`^/api/fleet/${PRODUCT}/avatars/${teammate.uid}\\?v=\\d+$`));
    const second = await profiles.setUploadedPhoto(PRODUCT, teammate, png);
    expect(second.photoURL).not.toBe(first.photoURL);

    const teammateView = await team.getTeam(PRODUCT, tenantId, admin);
    expect(teammateView.members.find((member) => member.uid === teammate.uid)).toMatchObject({ photoURL: second.photoURL, title: "Planner", name: "Mia M. Mate" });

    const seen = await getAvatar(context(admin), teammate.uid);
    expect(seen.status).toBe(200);
    expect(seen.headers.get("content-type")).toBe("image/png");
    expect(seen.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(seen.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await seen.arrayBuffer())).toEqual(png);
    expect((await getAvatar(context(teammate), teammate.uid)).status).toBe(200);
    expect((await getAvatar(context(stranger), teammate.uid)).status).toBe(404);
    // The former owner left the workspace, so they no longer see it either.
    expect((await getAvatar(context(owner), teammate.uid)).status).toBe(404);

    await profiles.removeAccountPhoto(PRODUCT, teammate);
    expect((await getAvatar(context(admin), teammate.uid)).status).toBe(404);
  });

  it("removes members, who then lose access to the workspace and its photos", async () => {
    await profiles.setUploadedPhoto(PRODUCT, admin, png);
    expect((await getAvatar(context(teammate), admin.uid)).status).toBe(200);
    await team.removeMember(PRODUCT, tenantId, fresh(admin), teammate.uid);
    expect((await membership(teammate.uid))?.status).toBe("removed");
    await expectFleetError(tenants.requireTenantMember(PRODUCT, tenantId, teammate), 404);
    await expectFleetError(team.getTeam(PRODUCT, tenantId, teammate), 404);
    expect((await getAvatar(context(teammate), admin.uid)).status).toBe(404);
  });

  it("hides member emails from non-privileged roles where the product asks for it", async () => {
    const host = person("c-host", "Cora Host");
    const fan = person("c-fan", "Finn Fan");
    const other = person("c-other", "Olga Other");
    const community = (await tenants.createTenant("community", host, "Garden Club")).id;
    await tenants.grantMembership("community", community, host, fan, "member");
    await tenants.grantMembership("community", community, host, other, "member");
    const asFan = await team.getTeam("community", community, fan);
    expect(asFan.members.find((member) => member.uid === other.uid)?.email).toBeNull();
    expect(asFan.members.find((member) => member.uid === fan.uid)?.email).toBe(fan.email);
    expect(asFan.invitations).toBeNull();
    const asHost = await team.getTeam("community", community, host);
    expect(asHost.members.find((member) => member.uid === other.uid)?.email).toBe(other.email);
    expect(asHost.roles.map((role) => role.id)).toEqual(["owner", "admin", "moderator", "member"]);
  });
});

describe("audit trail (emulator)", () => {
  it("records every team change as an append-only audit event", async () => {
    const actions = await auditActions();
    for (const action of [
      "tenant.created",
      "membership.granted",
      "invitation.created",
      "invitation.accepted",
      "invitation.revoked",
      "invitation.resent",
      "membership.role_changed",
      "ownership.transferred",
      "membership.left",
      "membership.removed",
    ]) {
      expect(actions).toContain(action);
    }
    const roleChange = await db.collection(`products/${PRODUCT}/tenants/${tenantId}/auditEvents`)
      .where("action", "==", "ownership.transferred").get();
    expect(roleChange.docs[0]?.data()).toMatchObject({ actor: { uid: owner.uid }, target: { type: "membership", id: admin.uid } });
    const accountEvents = await db.collection(`products/${PRODUCT}/users/${teammate.uid}/accountEvents`).get();
    expect(accountEvents.docs.map((doc) => doc.get("action"))).toEqual(expect.arrayContaining(["profile.updated", "profile.photo_uploaded"]));
  });
});

describe("sessions (Auth emulator)", () => {
  it.skipIf(!auth)("signs out everywhere by revoking every session cookie", async () => {
    const { user, cookie } = await signUp(`everywhere.${run}@example.com`, { verified: true });
    await expect(auth!.verifySessionCookie(cookie!, true)).resolves.toMatchObject({ uid: user.uid });
    // Revocation compares whole seconds against the sign-in time.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await profiles.revokeAllSessions(PRODUCT, user);
    await expect(auth!.verifySessionCookie(cookie!, true)).rejects.toMatchObject({ code: "auth/session-cookie-revoked" });
  });
});

/** Signs an existing emulator user in again (after their email was verified) for fresh claims. */
async function signUpAgain(email: string) {
  const endpoint = `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`;
  const signedIn = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: `pw-${run}-secure`, returnSecureToken: true }),
  }).then((response) => response.json()) as { idToken: string };
  return { cookie: await auth!.createSessionCookie(signedIn.idToken, { expiresIn: 60 * 60 * 1000 }) };
}
