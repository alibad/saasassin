import { describe, expect, it } from "vitest";

import {
  applyThreadAction,
  assignSplit,
  inverseAction,
  assignThreads,
  isReminderDue,
  matchesSplit,
  PRIMARY_SPLIT,
  searchMessages,
  splitCounts,
  threadIdFor,
  threadView,
  ThreadActionError,
  type SplitRule,
  type ThreadRecord,
} from "../src/lib/mail/workflow";

const now = new Date("2026-10-26T12:00:00.000Z");

function thread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id: "t1",
    subject: "Quarterly plan",
    snippet: "",
    participants: [],
    fromAddresses: ["ana@acme.com"],
    messageCount: 1,
    lastMessageAt: "2026-10-25T09:00:00.000Z",
    state: "inbox",
    starred: false,
    unread: true,
    labels: [],
    snoozedUntil: null,
    reminder: null,
    hasCalendarInvite: false,
    isNewsletter: false,
    ...overrides,
  };
}

describe("threading", () => {
  it("groups replies by In-Reply-To / References in any import order", () => {
    const root = { messageId: "root@x", inReplyTo: null, references: [], subject: "Plan", date: "2026-10-01T00:00:00Z" };
    const reply = { messageId: "r1@x", inReplyTo: "root@x", references: ["root@x"], subject: "Re: Plan", date: "2026-10-02T00:00:00Z" };
    const reply2 = { messageId: "r2@x", inReplyTo: "r1@x", references: ["root@x", "r1@x"], subject: "Re: Plan", date: "2026-10-03T00:00:00Z" };
    const forward = assignThreads([], [root, reply, reply2]);
    const reversed = assignThreads([], [{ ...reply2, date: null }, { ...reply, date: null }, { ...root, date: null }]);
    const expected = threadIdFor("root@x");
    for (const map of [forward, reversed]) {
      expect(map.get("root@x")).toBe(expected);
      expect(map.get("r1@x")).toBe(expected);
      expect(map.get("r2@x")).toBe(expected);
    }
  });

  it("joins a later import to a stored thread, including a parent referenced earlier", () => {
    const existing = [{ messageId: "child@x", threadId: "t_existing", references: ["parent@x"], inReplyTo: "parent@x", subject: "Re: Budget" }];
    const map = assignThreads(existing, [{ messageId: "parent@x", inReplyTo: null, references: [], subject: "Budget", date: null }]);
    expect(map.get("parent@x")).toBe("t_existing");
  });

  it("falls back to the normalized subject only for replies without headers", () => {
    const existing = [{ messageId: "a@x", threadId: "t_a", subject: "Launch notes" }];
    const map = assignThreads(existing, [
      { messageId: "b@x", inReplyTo: null, references: [], subject: "RE: Launch notes", date: null },
      { messageId: "c@x", inReplyTo: null, references: [], subject: "Launch notes", date: null },
    ]);
    expect(map.get("b@x")).toBe("t_a");
    expect(map.get("c@x")).toBe(threadIdFor("c@x"));
  });

  it("is idempotent for duplicates", () => {
    const existing = [{ messageId: "a@x", threadId: "t_a" }];
    const map = assignThreads(existing, [{ messageId: "a@x", inReplyTo: null, references: [], subject: "x", date: null }]);
    expect(map.get("a@x")).toBe("t_a");
  });
});

describe("split rules", () => {
  const rules: SplitRule[] = [
    { id: "news", name: "News", kind: "newsletter", value: "", order: 2 },
    { id: "cal", name: "Calendar", kind: "calendar-invite", value: "", order: 1 },
    { id: "acme", name: "Acme", kind: "from-domain", value: "@acme.com", order: 3 },
  ];

  it("matches domains including subdomains, not lookalikes", () => {
    expect(matchesSplit(thread({ fromAddresses: ["x@mail.acme.com"] }), rules[2])).toBe(true);
    expect(matchesSplit(thread({ fromAddresses: ["x@notacme.com"] }), rules[2])).toBe(false);
  });

  it("assigns the first matching split by order, else primary", () => {
    expect(assignSplit(thread({ hasCalendarInvite: true, isNewsletter: true }), rules)).toBe("cal");
    expect(assignSplit(thread({ isNewsletter: true }), rules)).toBe("news");
    expect(assignSplit(thread({ fromAddresses: ["z@other.org"] }), rules)).toBe(PRIMARY_SPLIT);
  });

  it("counts only inbox-visible threads per split", () => {
    const counts = splitCounts(
      [
        thread({ id: "a", isNewsletter: true }),
        thread({ id: "b", isNewsletter: true, unread: false }),
        thread({ id: "c", state: "archived", isNewsletter: true }),
        thread({ id: "d", fromAddresses: ["z@other.org"] }),
      ],
      rules,
      now,
    );
    expect(counts.news).toEqual({ total: 2, unread: 1 });
    expect(counts[PRIMARY_SPLIT]).toEqual({ total: 1, unread: 1 });
    expect(counts.acme).toEqual({ total: 0, unread: 0 });
  });
});

describe("snooze and reminders", () => {
  it("hides snoozed threads until the time passes", () => {
    const snoozed = thread({ snoozedUntil: "2026-10-27T08:00:00.000Z" });
    expect(threadView(snoozed, now)).toBe("snoozed");
    expect(threadView(snoozed, new Date("2026-10-27T08:00:01.000Z"))).toBe("inbox");
  });

  it("rejects snoozing into the past and clears snooze on archive", () => {
    expect(() => applyThreadAction(thread(), { type: "snooze", until: "2026-10-01T00:00:00Z" }, now)).toThrow(ThreadActionError);
    const patch = applyThreadAction(thread({ snoozedUntil: "2026-11-01T00:00:00Z" }), { type: "archive" }, now);
    expect(patch).toMatchObject({ state: "archived", snoozedUntil: null });
  });

  it("snoozing an archived thread brings it back to the inbox later", () => {
    const patch = applyThreadAction(thread({ state: "archived" }), { type: "snooze", until: "2026-10-28T00:00:00Z" }, now);
    const after = thread({ ...patch });
    expect(threadView(after, now)).toBe("snoozed");
    expect(threadView(after, new Date("2026-10-28T00:00:01Z"))).toBe("inbox");
  });

  it("surfaces a follow-up only when no reply arrived after it was set", () => {
    const reminder = { at: "2026-10-26T10:00:00.000Z", setAt: "2026-10-25T10:00:00.000Z" };
    expect(isReminderDue(thread({ state: "archived", reminder }), now)).toBe(true);
    expect(threadView(thread({ state: "archived", reminder }), now)).toBe("inbox");
    expect(isReminderDue(thread({ reminder, lastMessageAt: "2026-10-26T09:00:00.000Z" }), now)).toBe(false);
    expect(isReminderDue(thread({ reminder: { ...reminder, at: "2026-10-27T00:00:00Z" } }), now)).toBe(false);
  });

  it("archiving a surfaced follow-up dismisses it, a pending one survives", () => {
    const due = thread({ state: "archived", reminder: { at: "2026-10-26T10:00:00.000Z", setAt: "2026-10-25T10:00:00.000Z" } });
    const dismissed = thread({ ...due, ...applyThreadAction(due, { type: "archive" }, now) });
    expect(threadView(dismissed, now)).toBe("archived");
    expect(dismissed.reminder).toBeNull();
    const pending = thread({ reminder: { at: "2026-10-30T10:00:00.000Z", setAt: "2026-10-25T10:00:00.000Z" } });
    expect(applyThreadAction(pending, { type: "archive" }, now).reminder).toBeUndefined();
  });

  it("keeps labels sorted and unique", () => {
    const patch = applyThreadAction(thread({ labels: ["b"] }), { type: "label", label: "a", value: true }, now);
    expect(patch.labels).toEqual(["a", "b"]);
  });
});

describe("undo", () => {
  it("reverses archive, star, read and labels back to the prior state", () => {
    const base = thread({ starred: true, unread: true, labels: ["x"] });
    for (const action of [
      { type: "archive" as const },
      { type: "star" as const, value: false },
      { type: "read" as const, value: true },
      { type: "label" as const, label: "x", value: false },
    ]) {
      const after = { ...base, ...applyThreadAction(base, action, now) };
      const inverse = inverseAction(base, action)!;
      const restored = { ...after, ...applyThreadAction(after, inverse, now) };
      expect({ state: restored.state, starred: restored.starred, labels: restored.labels }).toEqual({ state: base.state, starred: base.starred, labels: base.labels });
    }
  });

  it("restores the previous snooze when undoing an archive of a snoozed thread", () => {
    const snoozed = thread({ snoozedUntil: "2026-11-01T00:00:00.000Z" });
    expect(inverseAction(snoozed, { type: "archive" })).toEqual({ type: "snooze", until: "2026-11-01T00:00:00.000Z" });
  });
});

describe("search", () => {
  const messages = [
    { threadId: "t1", subject: "Invoice October", from: { name: "Billing", email: "billing@vendor.com" }, to: [], cc: [], text: "Your invoice total is 120 EUR", date: "2026-10-01T00:00:00Z" },
    { threadId: "t2", subject: "Lunch", from: { name: "Ana", email: "ana@acme.com" }, to: [], cc: [], text: "Shall we discuss the invoice over lunch?", date: "2026-10-02T00:00:00Z", hasCalendarInvite: true },
  ];

  it("ranks subject matches above body matches and requires every term", () => {
    expect(searchMessages(messages, "invoice").map((hit) => hit.threadId)).toEqual(["t1", "t2"]);
    expect(searchMessages(messages, "invoice lunch").map((hit) => hit.threadId)).toEqual(["t2"]);
  });

  it("supports from:, subject: and has:invite operators", () => {
    expect(searchMessages(messages, "from:acme").map((hit) => hit.threadId)).toEqual(["t2"]);
    expect(searchMessages(messages, "subject:invoice").map((hit) => hit.threadId)).toEqual(["t1"]);
    expect(searchMessages(messages, "has:invite").map((hit) => hit.threadId)).toEqual(["t2"]);
    expect(searchMessages(messages, "   ")).toEqual([]);
  });
});
