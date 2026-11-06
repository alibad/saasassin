import { describe, expect, it } from "vitest";

import {
  actionSchema,
  extractMentions,
  mentionedHandles,
  normalizeHandle,
  publicName,
  suggestHandle,
  validateHandle,
} from "../src/lib/community/model";

describe("member-chosen handles", () => {
  it("normalizes and validates handles", () => {
    expect(normalizeHandle("  @@Ada_L ")).toBe("ada_l");
    expect(validateHandle("@Ada")).toEqual({ ok: true, handle: "ada" });
    expect(validateHandle("ab")).toMatchObject({ ok: false });
    expect(validateHandle("a".repeat(31))).toMatchObject({ ok: false });
    expect(validateHandle("-ada")).toMatchObject({ ok: false });
    expect(validateHandle("ada-")).toMatchObject({ ok: false });
    expect(validateHandle("ada lovelace")).toMatchObject({ ok: false });
    expect(validateHandle("ada.lovelace")).toMatchObject({ ok: false });
    expect(validateHandle("ada--l")).toMatchObject({ ok: false });
    expect(validateHandle("admin")).toEqual({ ok: false, error: "That handle is reserved." });
    expect(validateHandle("everyone")).toMatchObject({ ok: false });
    expect(validateHandle("grace_hopper-1")).toEqual({ ok: true, handle: "grace_hopper-1" });
  });

  it("suggests a free handle from the public name, never the email", () => {
    expect(suggestHandle("Ada Lovelace", new Set())).toBe("ada-lovelace");
    expect(suggestHandle("Ada Lovelace", new Set(["ada-lovelace"]))).toBe("ada-lovelace-2");
    expect(suggestHandle("Zoë Ångström", new Set())).toBe("zoe-angstrom");
    expect(suggestHandle("", new Set())).toBe("member");
    expect(suggestHandle("Al", new Set())).toBe("al-member");
    expect(suggestHandle("Admin", new Set())).toBe("admin-2");
  });

  it("finds mentions at word boundaries, not inside emails or dotted names", () => {
    expect([...mentionedHandles("Hi @ada. And (@grace), @bob-builds!")]).toEqual(["ada", "grace", "bob-builds"]);
    expect([...mentionedHandles("mail ada@example.com or @ada.lovelace")]).toEqual([]);
    expect([...mentionedHandles("@ADA at start")]).toEqual(["ada"]);
    const directory = [{ uid: "u1", handle: "ada" }, { uid: "u2", handle: null }];
    expect(extractMentions("@ada @nobody", directory)).toEqual(["u1"]);
  });

  it("names members by display name or account name, never email", () => {
    expect(publicName({ displayName: "  Ada  " }, "Account")).toBe("Ada");
    expect(publicName({ displayName: "" }, "Account Name")).toBe("Account Name");
    expect(publicName(null, "")).toBe("Member");
  });

  it("accepts a handle change action", () => {
    expect(actionSchema.parse({ type: "profile.handle", handle: "ada" })).toEqual({ type: "profile.handle", handle: "ada" });
    expect(() => actionSchema.parse({ type: "profile.handle", handle: "" })).toThrow();
  });
});
