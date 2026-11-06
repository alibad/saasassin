import { describe, expect, it } from "vitest";

import {
  actionSchema,
  applyRateLimit,
  blockPreventsReply,
  canGrantPlan,
  canSeeSpace,
  collectPage,
  lessonSchedule,
  redactLockedLessons,
  entitlementDocId,
  planChanges,
  planGrantsAccess,
  spaceGrantsFor,
  compareNewestFirst,
  extractMentions,
  feedQuerySchema,
  rateLimitMessage,
  safetyDocId,
  threadKey,
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

describe("cursor pagination", () => {
  const source = Array.from({ length: 23 }, (_, index) => ({ id: `p${String(index).padStart(2, "0")}`, visible: index % 3 !== 0 }));
  const fetchBatch = async (after: string | null, size: number) => {
    const start = after ? source.findIndex((item) => item.id === after) + 1 : 0;
    return source.slice(start, start + size);
  };

  it("pages a filtered source without duplicates or gaps", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: Awaited<ReturnType<typeof collectPage<(typeof source)[number]>>> = await collectPage({ fetchBatch, accept: (item) => item.visible, cursorOf: (item) => item.id, cursor, limit: 4, batchSize: 5 });
      expect(page.items.length).toBeLessThanOrEqual(4);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 20);
    expect(seen).toEqual(source.filter((item) => item.visible).map((item) => item.id));
  });

  it("returns a partial page with a cursor when the scan budget runs out", async () => {
    const page = await collectPage({ fetchBatch, accept: () => false, cursorOf: (item) => item.id, cursor: null, limit: 5, batchSize: 5, maxScan: 10 });
    expect(page).toEqual({ items: [], nextCursor: "p09", scanned: 10 });
    const end = await collectPage({ fetchBatch, accept: () => false, cursorOf: (item) => item.id, cursor: "p09", limit: 5, batchSize: 5 });
    expect(end.nextCursor).toBeNull();
  });

  it("orders newest first with a deterministic id tie-break and builds thread keys", () => {
    const items = [
      { id: "a", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "C", createdAt: "2026-01-02T00:00:00.000Z" },
      { id: "b", createdAt: "2026-01-02T00:00:00.000Z" },
    ];
    expect([...items].sort(compareNewestFirst).map((item) => item.id)).toEqual(["b", "C", "a"]);
    expect(threadKey("post1", "2026-01-01T00:00:00.000Z", "c9")).toBe("post1__2026-01-01T00:00:00.000Z__c9");
    expect(feedQuerySchema.parse({ limit: "30" })).toMatchObject({ limit: 30, filter: "all" });
    expect(() => feedQuerySchema.parse({ limit: "500" })).toThrow();
    expect(() => feedQuerySchema.parse({ cursor: "../../etc" })).toThrow();
  });
});

describe("safety", () => {
  const limit = { max: 3, windowMinutes: 10 };
  const now = new Date("2026-11-06T12:00:00.000Z");

  it("allows up to the limit inside a sliding window, then says when to retry", () => {
    const recent = ["2026-11-06T11:51:00.000Z", "2026-11-06T11:55:00.000Z", "2026-11-06T11:59:00.000Z"];
    const blocked = applyRateLimit(recent, now, limit);
    expect(blocked).toMatchObject({ allowed: false, retryAfterSeconds: 60 });
    expect(rateLimitMessage(blocked, limit)).toBe("You're posting too fast. This community allows 3 posts and replies per 10 minutes. Try again in 1 minute.");
    const later = applyRateLimit(recent, new Date("2026-11-06T12:01:30.000Z"), limit);
    expect(later.allowed).toBe(true);
    expect(later.timestamps).toEqual(["2026-11-06T11:55:00.000Z", "2026-11-06T11:59:00.000Z", "2026-11-06T12:01:30.000Z"]);
    expect(applyRateLimit(["2026-11-06T10:00:00.000Z"], now, limit)).toMatchObject({ allowed: true, timestamps: [now.toISOString()] });
    expect(rateLimitMessage({ retryAfterSeconds: 42 }, limit)).toMatch(/42 seconds/);
  });

  it("lets blocks stop member replies but never moderators", () => {
    expect(blockPreventsReply("block", "member")).toBe(true);
    expect(blockPreventsReply("block", "moderator")).toBe(false);
    expect(blockPreventsReply("mute", "member")).toBe(false);
    expect(blockPreventsReply(null, "member")).toBe(false);
    expect(safetyDocId("a", "b")).toBe("a__b");
    expect(actionSchema.parse({ type: "safety.set", targetUid: "u2", kind: null })).toMatchObject({ kind: null });
    expect(() => actionSchema.parse({ type: "settings.posting_limit", max: 0 })).toThrow();
  });
});

describe("plan edit and archive", () => {
  const live = { id: "p1", spaceIds: ["s1"], archived: false, existingAccess: null };
  const kept = { id: "p2", spaceIds: ["s2"], archived: true, existingAccess: "keep" as const };
  const revoked = { id: "p3", spaceIds: ["s3"], archived: true, existingAccess: "revoke" as const };

  it("stops new grants once archived and honours the existing-access choice", () => {
    expect(canGrantPlan(live)).toBe(true);
    expect(canGrantPlan(kept)).toBe(false);
    expect([live, kept, revoked].map(planGrantsAccess)).toEqual([true, true, false]);
    const active = new Set([entitlementDocId("p1", "u"), entitlementDocId("p2", "u"), entitlementDocId("p3", "u")]);
    expect(spaceGrantsFor("u", [live, kept, revoked], active).sort()).toEqual(["s1", "s2"]);
  });

  it("records only the fields an edit changed", () => {
    const before = { name: "VIP", description: "", priceLabel: "$20", spaceIds: ["b", "a"] };
    expect(planChanges(before, { ...before, spaceIds: ["a", "b"] })).toEqual({});
    expect(planChanges(before, { ...before, name: "VIP Club", spaceIds: ["a"] })).toEqual({
      name: { from: "VIP", to: "VIP Club" },
      spaceIds: { from: ["a", "b"], to: ["a"] },
    });
  });

  it("requires an explicit existing-access choice to archive", () => {
    expect(() => actionSchema.parse({ type: "plan.archive", planId: "p1" })).toThrow(/Choose what happens/);
    expect(actionSchema.parse({ type: "plan.archive", planId: "p1", existingAccess: "keep" })).toMatchObject({ reason: "" });
  });
});

describe("cohorts and drip", () => {
  const course = {
    dripByCohort: true,
    lessons: [
      { id: "l0", title: "Welcome", body: "a" },
      { id: "l3", title: "Week", body: "b", unlockDay: 3 },
      { id: "l10", title: "Finale", body: "c", unlockDay: 10 },
    ],
  };
  const now = new Date("2026-11-06T12:00:00.000Z");

  it("unlocks lessons by day after the earliest cohort start", () => {
    const schedule = lessonSchedule(course, ["2026-11-02T00:00:00.000Z", "2026-11-04T00:00:00.000Z"], now, false);
    expect(schedule.l0).toEqual({ unlocked: true, unlocksAt: null, reason: "open" });
    expect(schedule.l3).toEqual({ unlocked: true, unlocksAt: "2026-11-05T00:00:00.000Z", reason: "scheduled" });
    expect(schedule.l10).toEqual({ unlocked: false, unlocksAt: "2026-11-12T00:00:00.000Z", reason: "scheduled" });
    expect(lessonSchedule(course, [], now, false).l3).toEqual({ unlocked: false, unlocksAt: null, reason: "no_cohort" });
    expect(Object.values(lessonSchedule(course, [], now, true)).every((access) => access.unlocked)).toBe(true);
    expect(Object.values(lessonSchedule({ ...course, dripByCohort: false }, [], now, false)).every((access) => access.unlocked)).toBe(true);
  });

  it("strips locked lesson content", () => {
    const redacted = redactLockedLessons(course, lessonSchedule(course, [], now, false));
    expect(redacted.lessons.map((lesson) => lesson.body)).toEqual(["a", "", ""]);
  });

  it("opens private spaces to cohort members", () => {
    const space = { id: "s", visibility: "private" as const, memberUids: [], cohortIds: ["c1"] };
    expect(canSeeSpace(space, { uid: "u", role: "member", cohortIds: ["c1"] })).toBe(true);
    expect(canSeeSpace(space, { uid: "u", role: "member", cohortIds: ["c2"] })).toBe(false);
    expect(canSeeSpace(space, { uid: "u", role: "member" })).toBe(false);
  });

  it("validates cohort start dates", () => {
    expect(actionSchema.parse({ type: "cohort.create", name: "Spring", startsAt: "2027-03-01" })).toMatchObject({ startsAt: "2027-03-01T00:00:00.000Z" });
    expect(() => actionSchema.parse({ type: "cohort.create", name: "Spring", startsAt: "2027-13-45" })).toThrow();
    expect(() => actionSchema.parse({ type: "lesson.schedule", courseId: "c", lessonId: "l", unlockDay: -1 })).toThrow();
  });
});
