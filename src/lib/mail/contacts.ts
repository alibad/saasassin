/**
 * Address book derived from imported mail: everyone who sent you mail or was on a message,
 * with message counts, last contact, the threads you share and a user-editable display name.
 * Pure — the store feeds it message headers (never bodies) plus saved display-name overrides.
 */
import { hashString, type MailAddress } from "./mime";

export type ContactSource = { threadId: string; from: MailAddress | null; to: MailAddress[]; cc: MailAddress[]; date: string | null };

export type Contact = {
  id: string;
  email: string;
  /** Name seen most often in headers. */
  name: string;
  /** User-edited name, if any. */
  displayName: string | null;
  /** Messages this address sent. */
  sent: number;
  /** Messages this address received (to or cc). */
  received: number;
  messageCount: number;
  threadCount: number;
  threadIds: string[];
  firstSeenAt: string | null;
  lastContactedAt: string | null;
  isYou: boolean;
};

export function contactId(email: string) {
  return `c_${hashString(email.trim().toLowerCase())}`;
}

export function contactLabel(contact: Pick<Contact, "displayName" | "name" | "email">) {
  return contact.displayName || contact.name || contact.email;
}

type Accumulator = Omit<Contact, "name" | "threadIds" | "threadCount" | "displayName"> & { names: Map<string, { count: number; last: string }>; threads: Set<string> };

export function deriveContacts(messages: ContactSource[], overrides: Map<string, string> = new Map(), selfEmail = ""): Contact[] {
  const byEmail = new Map<string, Accumulator>();
  const self = selfEmail.trim().toLowerCase();
  function touch(address: MailAddress, role: "sent" | "received", message: ContactSource) {
    const email = address.email.trim().toLowerCase();
    if (!email.includes("@")) return;
    let entry = byEmail.get(email);
    if (!entry) {
      entry = { id: contactId(email), email, sent: 0, received: 0, messageCount: 0, firstSeenAt: null, lastContactedAt: null, isYou: email === self, names: new Map(), threads: new Set() };
      byEmail.set(email, entry);
    }
    entry[role] += 1;
    entry.threads.add(message.threadId);
    const date = message.date ?? "";
    if (date && (!entry.lastContactedAt || date > entry.lastContactedAt)) entry.lastContactedAt = date;
    if (date && (!entry.firstSeenAt || date < entry.firstSeenAt)) entry.firstSeenAt = date;
    const name = address.name.trim();
    if (name && name.toLowerCase() !== email) {
      const seen = entry.names.get(name) ?? { count: 0, last: "" };
      entry.names.set(name, { count: seen.count + 1, last: date > seen.last ? date : seen.last });
    }
  }
  for (const message of messages) {
    // One message counts once per address even if it is listed twice (e.g. to and cc).
    const recipients = new Map<string, MailAddress>();
    for (const address of [...message.to, ...message.cc]) if (!recipients.has(address.email.toLowerCase())) recipients.set(address.email.toLowerCase(), address);
    if (message.from) {
      touch(message.from, "sent", message);
      recipients.delete(message.from.email.toLowerCase());
    }
    for (const address of recipients.values()) touch(address, "received", message);
  }
  return [...byEmail.values()]
    .map(({ names, threads, ...entry }) => {
      const best = [...names.entries()].sort((a, b) => b[1].count - a[1].count || b[1].last.localeCompare(a[1].last) || a[0].localeCompare(b[0]))[0];
      return {
        ...entry,
        name: best?.[0] ?? "",
        displayName: overrides.get(entry.email) ?? null,
        messageCount: entry.sent + entry.received,
        threadCount: threads.size,
        threadIds: [...threads],
      };
    })
    .sort((a, b) => contactLabel(a).localeCompare(contactLabel(b), undefined, { sensitivity: "base" }) || a.email.localeCompare(b.email));
}

/** People you exchange the most mail with (you excluded), most recent first on ties. */
export function frequentCorrespondents(contacts: Contact[], limit = 8) {
  return contacts
    .filter((contact) => !contact.isYou)
    .sort((a, b) => b.messageCount - a.messageCount || (b.lastContactedAt ?? "").localeCompare(a.lastContactedAt ?? "") || a.email.localeCompare(b.email))
    .slice(0, limit);
}

export function searchContacts(contacts: Contact[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return contacts;
  return contacts.filter((contact) => [contact.email, contact.name, contact.displayName ?? ""].some((value) => value.toLowerCase().includes(needle)));
}
