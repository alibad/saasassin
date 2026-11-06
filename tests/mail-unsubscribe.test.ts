import { describe, expect, it } from "vitest";

import { parseListUnsubscribe } from "../src/lib/mail/unsubscribe";
import { applyThreadAction, inverseAction, ThreadActionError, type ThreadRecord } from "../src/lib/mail/workflow";

describe("List-Unsubscribe helper", () => {
  it("extracts a mailto target and an https link", () => {
    const targets = parseListUnsubscribe("<mailto:unsub@letters.io?subject=stop%20please>, <https://letters.io/u/abc?x=1>", "List-Unsubscribe=One-Click");
    expect(targets).toEqual({
      mailto: { address: "unsub@letters.io", subject: "stop please", body: "", href: "mailto:unsub@letters.io?subject=stop%20please" },
      web: { href: "https://letters.io/u/abc?x=1", host: "letters.io", secure: true },
      oneClick: true,
    });
  });

  it("defaults the subject, keeps a body and handles folded headers", () => {
    expect(parseListUnsubscribe("<mailto:list-request@x.org?body=unsubscribe%20me>")?.mailto).toMatchObject({ subject: "unsubscribe", body: "unsubscribe me" });
    expect(parseListUnsubscribe("< https://x.org/\n  unsub >")?.web?.href).toBe("https://x.org/unsub");
    expect(parseListUnsubscribe("https://bare.example.com/u")?.web?.host).toBe("bare.example.com");
  });

  it("refuses scripts, data URLs, credentials and malformed addresses", () => {
    expect(parseListUnsubscribe("<javascript:alert(1)>")).toBeNull();
    expect(parseListUnsubscribe("<data:text/html,hi>")).toBeNull();
    expect(parseListUnsubscribe("<https://user:pass@evil.example.com/>")).toBeNull();
    expect(parseListUnsubscribe("<mailto:not an address>")).toBeNull();
    expect(parseListUnsubscribe("<mailto:a@b.co?subject=%E0%A4%A>")?.mailto?.subject).toBe("%E0%A4%A");
    expect(parseListUnsubscribe(null)).toBeNull();
  });

  it("marks plain http links as insecure and never claims one-click for them", () => {
    expect(parseListUnsubscribe("<http://old.example.com/u>", "List-Unsubscribe=One-Click")).toEqual({ mailto: null, web: { href: "http://old.example.com/u", host: "old.example.com", secure: false }, oneClick: false });
  });
});

describe("mute", () => {
  const now = new Date("2026-10-26T12:00:00.000Z");
  const base: ThreadRecord = {
    id: "t1", subject: "Long thread", snippet: "", participants: [], fromAddresses: [], messageCount: 3, lastMessageAt: "2026-10-25T09:00:00.000Z",
    state: "inbox", starred: false, unread: true, labels: [], snoozedUntil: "2026-10-30T00:00:00.000Z", reminder: null, hasCalendarInvite: false, isNewsletter: false, muted: false,
  };

  it("archives and flags the thread; unmute can return it to the inbox", () => {
    expect(applyThreadAction(base, { type: "mute", value: true }, now)).toEqual({ muted: true, state: "archived", snoozedUntil: null });
    expect(applyThreadAction({ ...base, muted: true, state: "archived" }, { type: "mute", value: false }, now)).toEqual({ muted: false });
    expect(applyThreadAction({ ...base, muted: true, state: "archived" }, { type: "mute", value: false, restore: true }, now)).toEqual({ muted: false, state: "inbox", snoozedUntil: null });
    expect(() => applyThreadAction({ ...base, state: "trash" }, { type: "mute", value: true }, now)).toThrow(ThreadActionError);
  });

  it("undo of muting an inbox thread unmutes and restores it", () => {
    expect(inverseAction(base, { type: "mute", value: true })).toEqual({ type: "mute", value: false, restore: true });
    expect(inverseAction({ ...base, state: "archived" }, { type: "mute", value: true })).toEqual({ type: "mute", value: false, restore: false });
  });
});
