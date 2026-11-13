import { describe, expect, it } from "vitest";

import {
  avatarTintIndex,
  checkAvatarBytes,
  detectAvatarImageType,
  initialsFor,
  maskEmail,
  MAX_AVATAR_BYTES,
  normalizeEmail,
  parseAuthProviders,
  providerFromFirebaseId,
  sanitizeNextPath,
} from "../src/lib/fleet/account/identity";
import {
  assignableRoles,
  canGrantRole,
  DEFAULT_TEAM_CONFIG,
  grantableRoles,
  planLeave,
  planRemoval,
  planRoleChange,
  planTransfer,
  resolveTeamConfig,
  roleAfterTransfer,
  roleChangeNeedsRecentAuth,
  roleLabel,
  type TeamMemberState,
} from "../src/lib/fleet/account/roles";
import { invitationCreateSchema, profileUpdateSchema } from "../src/lib/fleet/account/schemas";
import { getTeamConfig } from "../src/lib/fleet/account/team-config";
import {
  createInviteSecret,
  effectiveInvitationStatus,
  formatInviteToken,
  hashInviteSecret,
  inviteEmailKey,
  parseInviteToken,
  verifyInviteSecret,
} from "../src/lib/fleet/platform/invite-token";
import { productPublicPath, resolveFleetRequest } from "../src/lib/fleet/routing";

const member = (uid: string, role: string, status = "active"): TeamMemberState => ({ uid, role, status });

describe("invitation tokens", () => {
  it("formats, parses and verifies a token without storing the secret", () => {
    const secret = createInviteSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createInviteSecret()).not.toBe(secret);
    const hash = hashInviteSecret(secret);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(secret);

    const token = formatInviteToken("abcDEF123", secret);
    expect(parseInviteToken(token)).toEqual({ invitationId: "abcDEF123", secret });
    expect(parseInviteToken(encodeURIComponent(token))).toEqual({ invitationId: "abcDEF123", secret });
    expect(verifyInviteSecret(secret, hash)).toBe(true);
  });

  it("rejects wrong secrets, malformed hashes and malformed tokens", () => {
    const secret = createInviteSecret();
    const hash = hashInviteSecret(secret);
    expect(verifyInviteSecret(createInviteSecret(), hash)).toBe(false);
    expect(verifyInviteSecret(secret, "")).toBe(false);
    expect(verifyInviteSecret(secret, null)).toBe(false);
    expect(verifyInviteSecret(secret, "zz".repeat(32))).toBe(false);

    for (const bad of ["", "noDot", ".secretonly", `id.${"x".repeat(10)}`, `id!.${secret}`, `../x.${secret}`, `id.${secret}%`, "%E0%A4%A"]) {
      expect(parseInviteToken(bad)).toBeNull();
    }
    expect(parseInviteToken(null)).toBeNull();
    expect(parseInviteToken(undefined)).toBeNull();
  });

  it("hashes email lookups and reports expiry without a write", () => {
    expect(inviteEmailKey("a@b.co")).toMatch(/^[a-f0-9]{64}$/);
    expect(inviteEmailKey("a@b.co")).not.toContain("@");
    const now = 1_000_000;
    expect(effectiveInvitationStatus("pending", now + 1, now)).toBe("pending");
    expect(effectiveInvitationStatus("pending", now, now)).toBe("expired");
    expect(effectiveInvitationStatus("pending", null, now)).toBe("pending");
    expect(effectiveInvitationStatus("accepted", now - 1, now)).toBe("accepted");
    expect(effectiveInvitationStatus("revoked", now + 1, now)).toBe("revoked");
  });
});

describe("team roles", () => {
  const config = DEFAULT_TEAM_CONFIG;

  it("defaults to owner / admin / member / viewer and never assigns owner", () => {
    expect(config.roles.map((role) => role.id)).toEqual(["owner", "admin", "member", "viewer"]);
    expect(assignableRoles(config).map((role) => role.id)).toEqual(["admin", "member", "viewer"]);
    expect(config.defaultInviteRole).toBe("member");
    expect(roleLabel(config, "admin")).toBe("Admin");
    expect(roleLabel(config, "legacy")).toBe("Legacy");
  });

  it("adds the owner role to a product list that forgot it and picks a non-privileged default", () => {
    const resolved = resolveTeamConfig({ roles: [{ id: "editor", label: "Editor", description: "" }, { id: "reader", label: "Reader", description: "" }] });
    expect(resolved.roles[0].id).toBe("owner");
    expect(resolved.privilegedRoles).toContain("owner");
    expect(resolved.defaultInviteRole).toBe("editor");
  });

  it("uses each product's own roles and email visibility", () => {
    expect(getTeamConfig("revenue").roles.map((role) => role.id)).toEqual(["owner", "admin", "manager", "rep", "viewer"]);
    expect(getTeamConfig("revenue").defaultInviteRole).toBe("rep");
    expect(getTeamConfig("community").roles.map((role) => role.id)).toEqual(["owner", "admin", "moderator", "member"]);
    expect(getTeamConfig("community").memberEmails).toBe("privileged");
    expect(getTeamConfig("research").memberEmails).toBe("everyone");
    expect(getTeamConfig("unknown-product").roles.map((role) => role.id)).toEqual(["owner", "admin", "member", "viewer"]);
  });

  it("lets privileged roles change roles but never assign ownership", () => {
    const members = [member("o", "owner"), member("a", "admin"), member("m", "member"), member("v", "viewer")];
    expect(planRoleChange(config, { actor: members[1], target: members[2], nextRole: "viewer", members })).toEqual({ ok: true });
    expect(planRoleChange(config, { actor: members[2], target: members[3], nextRole: "member", members })).toMatchObject({ ok: false, status: 403 });
    expect(planRoleChange(config, { actor: members[0], target: members[2], nextRole: "owner", members })).toMatchObject({ ok: false, status: 400 });
    expect(planRoleChange(config, { actor: members[0], target: members[2], nextRole: "superuser", members })).toMatchObject({ ok: false, status: 400 });
    expect(planRoleChange(config, { actor: members[0], target: member("x", "", "missing"), nextRole: "viewer", members })).toMatchObject({ ok: false, status: 404 });
  });

  it("lets only the owner manage admins where a product asks for it", () => {
    const community = getTeamConfig("community");
    expect(community.ownerManagesAdmins).toBe(true);
    expect(getTeamConfig("research").ownerManagesAdmins).toBe(false);
    const members = [member("o", "owner"), member("a", "admin"), member("b", "admin"), member("m", "member")];
    expect(planRoleChange(community, { actor: members[1], target: members[3], nextRole: "admin", members })).toMatchObject({ ok: false, status: 403 });
    expect(planRoleChange(community, { actor: members[1], target: members[2], nextRole: "member", members })).toMatchObject({ ok: false, status: 403 });
    expect(planRoleChange(community, { actor: members[1], target: members[3], nextRole: "moderator", members })).toEqual({ ok: true });
    expect(planRoleChange(community, { actor: members[0], target: members[3], nextRole: "admin", members })).toEqual({ ok: true });
    expect(planRemoval(community, { actor: members[1], target: members[2], members })).toMatchObject({ ok: false, status: 403 });
    expect(planRemoval(community, { actor: members[1], target: members[3], members })).toEqual({ ok: true });
    expect(canGrantRole(community, "admin", "admin")).toBe(false);
    expect(canGrantRole(community, "owner", "admin")).toBe(true);
    expect(grantableRoles(community, "admin").map((role) => role.id)).toEqual(["moderator", "member"]);
    expect(grantableRoles(config, "admin").map((role) => role.id)).toEqual(assignableRoles(config).map((role) => role.id));
  });

  it("protects owners and the last owner", () => {
    const members = [member("o", "owner"), member("a", "admin")];
    expect(planRoleChange(config, { actor: members[1], target: members[0], nextRole: "member", members })).toMatchObject({ ok: false, status: 403 });
    expect(planRoleChange(config, { actor: members[0], target: members[0], nextRole: "admin", members })).toMatchObject({ ok: false, status: 409, code: "last_owner" });
    const twoOwners = [member("o", "owner"), member("p", "owner")];
    expect(planRoleChange(config, { actor: twoOwners[0], target: twoOwners[0], nextRole: "admin", members: twoOwners })).toEqual({ ok: true });
    // A removed owner does not count towards the owners a workspace has.
    const oneActive = [member("o", "owner"), member("p", "owner", "removed")];
    expect(planRoleChange(config, { actor: oneActive[0], target: oneActive[0], nextRole: "admin", members: oneActive })).toMatchObject({ ok: false, code: "last_owner" });
  });

  it("guards removal and leaving", () => {
    const members = [member("o", "owner"), member("a", "admin"), member("m", "member")];
    expect(planRemoval(config, { actor: members[1], target: members[2], members })).toEqual({ ok: true });
    expect(planRemoval(config, { actor: members[2], target: members[1], members })).toMatchObject({ ok: false, status: 403 });
    expect(planRemoval(config, { actor: members[1], target: members[0], members })).toMatchObject({ ok: false, status: 403 });
    expect(planRemoval(config, { actor: members[1], target: members[1], members })).toMatchObject({ ok: false, status: 400 });
    expect(planLeave({ actor: members[2], members })).toEqual({ ok: true });
    expect(planLeave({ actor: members[0], members })).toMatchObject({ ok: false, code: "last_owner" });
    expect(planLeave({ actor: member("x", "member", "removed"), members })).toMatchObject({ ok: false, status: 404 });
  });

  it("transfers ownership only from an owner to another active member", () => {
    const members = [member("o", "owner"), member("a", "admin"), member("v", "viewer"), member("r", "member", "removed")];
    expect(planTransfer(config, { actor: members[0], target: members[2] })).toEqual({ ok: true });
    expect(planTransfer(config, { actor: members[1], target: members[2] })).toMatchObject({ ok: false, status: 403 });
    expect(planTransfer(config, { actor: members[0], target: members[0] })).toMatchObject({ ok: false, status: 400 });
    expect(planTransfer(config, { actor: members[0], target: members[3] })).toMatchObject({ ok: false, status: 404 });
    expect(roleAfterTransfer(config)).toBe("admin");
    expect(roleAfterTransfer(getTeamConfig("revenue"))).toBe("admin");
  });

  it("asks for a recent sign-in only when admin rights change", () => {
    expect(roleChangeNeedsRecentAuth(config, "member", "viewer")).toBe(false);
    expect(roleChangeNeedsRecentAuth(config, "member", "admin")).toBe(true);
    expect(roleChangeNeedsRecentAuth(config, "admin", "viewer")).toBe(true);
  });
});

describe("identity helpers", () => {
  it("normalises and masks emails", () => {
    expect(normalizeEmail("  Jane.Doe@ACME.com ")).toBe("jane.doe@acme.com");
    expect(maskEmail("Jane.Doe@acme.com")).toBe("j•••@acme.com");
    expect(maskEmail("nonsense")).toBe("•••");
    expect(invitationCreateSchema.parse({ email: "  New@Example.COM ", role: "member" }).email).toBe("new@example.com");
    expect(() => invitationCreateSchema.parse({ email: "not-an-email", role: "member" })).toThrow();
  });

  it("only follows same-origin relative next paths", () => {
    const fallback = "/apps/research";
    expect(sanitizeNextPath("/apps/research/invite/abc.def?x=1#top", fallback)).toBe("/apps/research/invite/abc.def?x=1#top");
    expect(sanitizeNextPath("/account", fallback)).toBe("/account");
    for (const bad of [
      null, undefined, "", "apps/research", "//evil.example", "/\\evil.example", "\\\\evil.example",
      "https://evil.example/x", "javascript:alert(1)", "/apps\u0000/x", " //evil.example", "/%0d%0aSet-Cookie:x",
    ]) {
      const result = sanitizeNextPath(bad as string | null | undefined, fallback);
      expect(result.startsWith("/")).toBe(true);
      expect(result.startsWith("//")).toBe(false);
      if (bad === "/%0d%0aSet-Cookie:x") expect(result).toBe("/%0d%0aSet-Cookie:x");
      else expect(result).toBe(fallback);
    }
  });

  it("accepts only PNG, JPEG and WebP avatars by their magic bytes", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0]);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    const gif = new TextEncoder().encode("GIF89a....");
    const riffWav = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]);
    expect(detectAvatarImageType(png)).toBe("image/png");
    expect(detectAvatarImageType(jpeg)).toBe("image/jpeg");
    expect(detectAvatarImageType(webp)).toBe("image/webp");
    expect(detectAvatarImageType(svg)).toBeNull();
    expect(detectAvatarImageType(gif)).toBeNull();
    expect(detectAvatarImageType(riffWav)).toBeNull();
    expect(checkAvatarBytes(new Uint8Array())).toMatchObject({ ok: false });
    expect(checkAvatarBytes(svg)).toMatchObject({ ok: false, message: "Use a PNG, JPEG or WebP image." });
    const tooBig = new Uint8Array(MAX_AVATAR_BYTES + 1);
    tooBig.set(png);
    expect(checkAvatarBytes(tooBig)).toMatchObject({ ok: false });
    expect(checkAvatarBytes(png)).toEqual({ ok: true, contentType: "image/png" });
  });

  it("derives initials, tints and providers", () => {
    expect(initialsFor("Ada Lovelace")).toBe("AL");
    expect(initialsFor("Ada King Lovelace")).toBe("AL");
    expect(initialsFor("cher")).toBe("C");
    expect(initialsFor("", "zed@example.com")).toBe("Z");
    expect(initialsFor(null, null)).toBe("?");
    expect(avatarTintIndex("uid-1")).toBe(avatarTintIndex("uid-1"));
    expect(avatarTintIndex("uid-1", 6)).toBeLessThan(6);
    expect(parseAuthProviders(undefined)).toEqual(["google"]);
    expect(parseAuthProviders(" GitHub, microsoft,unknown,google ")).toEqual(["google", "microsoft", "github"]);
    expect(parseAuthProviders("apple")).toEqual(["google", "apple"]);
    expect(providerFromFirebaseId("microsoft.com")).toBe("microsoft");
    expect(providerFromFirebaseId("password")).toBe("password");
    expect(providerFromFirebaseId("phone")).toBeNull();
  });

  it("validates profile updates strictly", () => {
    expect(profileUpdateSchema.parse({ name: "  Ada  ", title: "" })).toEqual({ name: "Ada", title: "" });
    expect(() => profileUpdateSchema.parse({ photoSource: "upload" })).toThrow();
    expect(() => profileUpdateSchema.parse({ email: "x@y.z" })).toThrow();
  });
});

describe("account routes on product hosts", () => {
  it("rewrites /account and invitation links (which contain a dot) into the product", () => {
    expect(resolveFleetRequest("research.saasassin.net", "/account")).toEqual({ action: "rewrite", pathname: "/apps/research/account" });
    expect(resolveFleetRequest("community.saasassin.net", "/invite/abc123.secret_value-x")).toEqual({
      action: "rewrite",
      pathname: "/apps/community/invite/abc123.secret_value-x",
    });
    expect(resolveFleetRequest("localhost:3000", "/apps/trust/account")).toEqual({ action: "next" });
    expect(resolveFleetRequest(null, "/invite/abc.def", false, "mail")).toEqual({ action: "rewrite", pathname: "/apps/mail/invite/abc.def" });
  });

  it("builds the short invitation path on the product's own host and the internal one elsewhere", () => {
    expect(productPublicPath("research.saasassin.net", "research", "/invite/a.b")).toBe("/invite/a.b");
    expect(productPublicPath("research.saasassin.net:443", "research", "/invite/a.b")).toBe("/invite/a.b");
    expect(productPublicPath("planner.saasassin.net", "research", "/invite/a.b")).toBe("/apps/research/invite/a.b");
    expect(productPublicPath("localhost:3000", "research", "invite/a.b")).toBe("/apps/research/invite/a.b");
    expect(productPublicPath("research.example.org", "research", "/invite/a.b", "research")).toBe("/invite/a.b");
  });
});
