import { describe, expect, it } from "vitest";

import { contactId, contactLabel, deriveContacts, frequentCorrespondents, searchContacts } from "../src/lib/mail/contacts";

const me = { name: "Mia", email: "mia@example.com" };
const ana = { name: "Ana Ruiz", email: "Ana@Acme.com" };
const bob = { name: "", email: "bob@acme.com" };

const messages = [
  { threadId: "t1", from: ana, to: [me], cc: [bob], date: "2026-10-01T09:00:00.000Z" },
  { threadId: "t1", from: me, to: [{ name: "Ana R.", email: "ana@acme.com" }], cc: [], date: "2026-10-02T09:00:00.000Z" },
  { threadId: "t2", from: { name: "Ana Ruiz", email: "ana@acme.com" }, to: [me, me], cc: [me], date: "2026-10-05T09:00:00.000Z" },
  { threadId: "t3", from: bob, to: [me], cc: [], date: null },
  { threadId: "t4", from: { name: "", email: "not-an-address" }, to: [], cc: [], date: "2026-10-06T00:00:00.000Z" },
];

describe("address book", () => {
  const contacts = deriveContacts(messages, new Map([["bob@acme.com", "Bobby (Acme)"]]), "MIA@example.com");
  const byEmail = new Map(contacts.map((contact) => [contact.email, contact]));

  it("counts sent and received messages per address, once per message", () => {
    expect(byEmail.get("ana@acme.com")).toMatchObject({ sent: 2, received: 1, messageCount: 3, threadCount: 2, firstSeenAt: "2026-10-01T09:00:00.000Z", lastContactedAt: "2026-10-05T09:00:00.000Z" });
    expect(byEmail.get("mia@example.com")).toMatchObject({ sent: 1, received: 3, isYou: true });
    expect(byEmail.get("bob@acme.com")).toMatchObject({ sent: 1, received: 1, threadIds: ["t1", "t3"], lastContactedAt: "2026-10-01T09:00:00.000Z" });
    expect(byEmail.has("not-an-address")).toBe(false);
  });

  it("uses the most common header name and applies saved display names", () => {
    expect(byEmail.get("ana@acme.com")?.name).toBe("Ana Ruiz");
    expect(byEmail.get("bob@acme.com")).toMatchObject({ name: "", displayName: "Bobby (Acme)" });
    expect(contactLabel(byEmail.get("bob@acme.com")!)).toBe("Bobby (Acme)");
    expect(contactLabel({ name: "", displayName: null, email: "x@y.z" })).toBe("x@y.z");
  });

  it("ranks frequent correspondents without you", () => {
    expect(frequentCorrespondents(contacts).map((contact) => contact.email)).toEqual(["ana@acme.com", "bob@acme.com"]);
  });

  it("filters by name, display name or address", () => {
    expect(searchContacts(contacts, "bobby").map((contact) => contact.email)).toEqual(["bob@acme.com"]);
    expect(searchContacts(contacts, "ACME").length).toBe(2);
    expect(searchContacts(contacts, "  ").length).toBe(3);
  });

  it("derives stable ids from the lower-cased address", () => {
    expect(contactId("Ana@Acme.com ")).toBe(contactId("ana@acme.com"));
    expect(contactId("ana@acme.com")).toMatch(/^c_[0-9a-f]{16}$/);
  });
});
