import { describe, expect, it } from "vitest";

import {
  applyArrival,
  describeActions,
  describeConditions,
  filterOutcome,
  matchesCondition,
  matchesFilter,
  NO_FILTER_OUTCOME,
  retroPatch,
  type FilterRule,
} from "../src/lib/mail/filters";
import { filterSchema } from "../src/lib/mail/schema";

const message = {
  from: { name: "Stripe Receipts", email: "receipts@stripe.com" },
  to: [{ name: "Mia", email: "mia@example.com" }],
  cc: [{ name: "", email: "finance@example.com" }],
  subject: "Your receipt from Acme #1042",
  listId: "Stripe Receipts <receipts.stripe.com>",
  attachments: [{ filename: "receipt.pdf" }],
};

function rule(overrides: Partial<FilterRule> = {}): FilterRule {
  return {
    id: "f1",
    name: "Receipts",
    match: "all",
    conditions: [{ field: "from", value: "stripe.com" }],
    actions: { label: "Receipts", archive: false, star: false, markRead: false, skipInbox: false },
    enabled: true,
    order: 1,
    ...overrides,
  };
}

const thread = { state: "inbox" as const, unread: false, snoozedUntil: null as string | null, labels: [] as string[], starred: false, muted: false };

describe("filter conditions", () => {
  it("matches from, to/cc, subject, list-id and attachments case-insensitively", () => {
    expect(matchesCondition({ field: "from", value: "STRIPE RECEIPTS" }, message)).toBe(true);
    expect(matchesCondition({ field: "from", value: "@stripe.com" }, message)).toBe(true);
    expect(matchesCondition({ field: "to", value: "finance@" }, message)).toBe(true);
    expect(matchesCondition({ field: "to", value: "ceo@" }, message)).toBe(false);
    expect(matchesCondition({ field: "subject", value: "receipt from" }, message)).toBe(true);
    expect(matchesCondition({ field: "list-id", value: "receipts.stripe.com" }, message)).toBe(true);
    expect(matchesCondition({ field: "list-id", value: "x" }, { ...message, listId: null })).toBe(false);
    expect(matchesCondition({ field: "has-attachment", value: "yes" }, message)).toBe(true);
    expect(matchesCondition({ field: "has-attachment", value: "no" }, message)).toBe(false);
    expect(matchesCondition({ field: "has-attachment", value: "no" }, { ...message, attachments: [] })).toBe(true);
  });

  it("never matches an empty value", () => {
    expect(matchesCondition({ field: "subject", value: "  " }, message)).toBe(false);
    expect(matchesFilter({ match: "all", conditions: [] }, message)).toBe(false);
  });

  it("combines conditions with all / any", () => {
    const conditions = [{ field: "from" as const, value: "stripe.com" }, { field: "subject" as const, value: "invoice" }];
    expect(matchesFilter({ match: "all", conditions }, message)).toBe(false);
    expect(matchesFilter({ match: "any", conditions }, message)).toBe(true);
  });
});

describe("filter outcome", () => {
  it("merges every enabled matching rule in order and skips disabled ones", () => {
    const outcome = filterOutcome(
      [
        rule({ id: "b", order: 2, actions: { label: "Money", archive: true, star: false, markRead: true, skipInbox: false } }),
        rule({ id: "a", order: 1 }),
        rule({ id: "off", order: 0, enabled: false, actions: { label: "Never", archive: false, star: true, markRead: false, skipInbox: true } }),
        rule({ id: "miss", conditions: [{ field: "subject", value: "nope" }] }),
      ],
      message,
    );
    expect(outcome).toEqual({ label: null, labels: ["Receipts", "Money"], archive: true, star: false, markRead: true, skipInbox: false, matched: ["a", "b"] });
  });
});

describe("arrival", () => {
  it("brings a thread back to the inbox and marks it unread by default", () => {
    const next = applyArrival({ ...thread, state: "archived" as const, snoozedUntil: "2099-01-01T00:00:00Z" }, NO_FILTER_OUTCOME, false);
    expect(next).toMatchObject({ state: "inbox", unread: true, snoozedUntil: null });
  });

  it("skip inbox keeps an existing thread where it is and files a new one in Done", () => {
    const outcome = filterOutcome([rule({ actions: { label: null, archive: false, star: false, markRead: false, skipInbox: true } })], message);
    expect(applyArrival({ ...thread, state: "archived" as const, snoozedUntil: "2099-01-01T00:00:00Z" }, outcome, false)).toMatchObject({ state: "archived", snoozedUntil: "2099-01-01T00:00:00Z", unread: true });
    expect(applyArrival(thread, outcome, true)).toMatchObject({ state: "archived" });
    expect(applyArrival(thread, outcome, false)).toMatchObject({ state: "inbox" });
  });

  it("muted threads behave like skip inbox", () => {
    expect(applyArrival({ ...thread, state: "archived" as const, muted: true }, NO_FILTER_OUTCOME, false)).toMatchObject({ state: "archived", unread: true });
  });

  it("archive, star, mark read and labels apply; trash stays trash", () => {
    const outcome = filterOutcome([rule({ actions: { label: "Receipts", archive: true, star: true, markRead: true, skipInbox: false } })], message);
    expect(applyArrival(thread, outcome, false)).toMatchObject({ state: "archived", starred: true, unread: false, labels: ["Receipts"] });
    expect(applyArrival({ ...thread, state: "trash" as const }, outcome, false)).toMatchObject({ state: "trash", labels: ["Receipts"] });
  });
});

describe("retro-apply", () => {
  const outcome = filterOutcome([rule({ actions: { label: "Receipts", archive: true, star: false, markRead: true, skipInbox: false } })], message);

  it("patches only what changes and never touches Trash", () => {
    expect(retroPatch({ ...thread, unread: true }, outcome)).toEqual({ labels: ["Receipts"], unread: false, state: "archived" });
    expect(retroPatch({ ...thread, state: "archived", labels: ["Receipts"] }, outcome)).toBeNull();
    expect(retroPatch({ ...thread, state: "trash" }, outcome)).toBeNull();
    expect(retroPatch(thread, NO_FILTER_OUTCOME)).toBeNull();
  });
});

describe("filter schema", () => {
  it("requires a value per condition and at least one action", () => {
    expect(() => filterSchema.parse({ name: "x", conditions: [{ field: "from", value: "" }], actions: { label: "A" } })).toThrow();
    expect(() => filterSchema.parse({ name: "x", conditions: [{ field: "from", value: "a" }], actions: {} })).toThrow();
    expect(() => filterSchema.parse({ name: "x", conditions: [], actions: { star: true } })).toThrow();
    const parsed = filterSchema.parse({ name: " Files ", conditions: [{ field: "has-attachment", value: "anything" }], actions: { label: "", star: true } });
    expect(parsed).toMatchObject({ name: "Files", match: "all", conditions: [{ field: "has-attachment", value: "yes" }], actions: { label: null, star: true, archive: false }, enabled: true });
  });

  it("describes rules for people", () => {
    expect(describeConditions(rule({ match: "any", conditions: [{ field: "from", value: "a" }, { field: "has-attachment", value: "yes" }] }))).toBe("from contains “a” or has an attachment");
    expect(describeActions({ label: "R", archive: true, star: false, markRead: true, skipInbox: true })).toBe("label “R”, mark read, archive, skip the inbox");
  });
});
