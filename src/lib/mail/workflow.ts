/**
 * Pure mailbox workflow logic: threading, split rules, inbox state (archive/trash/snooze),
 * follow-up reminders, and in-memory search. Shared by route handlers, the UI and tests.
 */
import { hashString, type MailAddress } from "./mime";

/* ---------- threading ---------- */

export type ThreadingInput = {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  date: string | null;
};

export type KnownMessage = { messageId: string; threadId: string; references?: string[]; inReplyTo?: string | null; subject?: string };

const REPLY_PREFIX = /^\s*((re|aw|sv|antw|fwd?|fw|wg|tr)(\[\d+\])?\s*:\s*)+/i;

export function normalizeSubject(subject: string) {
  return subject.replace(REPLY_PREFIX, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function isReplySubject(subject: string) {
  return /^\s*(re|aw|sv|antw)(\[\d+\])?\s*:/i.test(subject);
}

export function threadIdFor(rootMessageId: string) {
  return `t_${hashString(rootMessageId.toLowerCase())}`;
}

export function messageDocId(messageId: string) {
  return `m_${hashString(messageId.toLowerCase())}`;
}

/**
 * Assigns a thread to each incoming message given the messages already stored.
 * Order-independent: a reply imported before its parent lands in the same thread because the
 * thread id is derived from the root reference, and parents are matched by ids their children cite.
 */
export function assignThreads(existing: KnownMessage[], incoming: ThreadingInput[]) {
  const byId = new Map<string, string>();
  const stored = new Set<string>();
  const bySubject = new Map<string, string>();
  for (const message of existing) {
    byId.set(message.messageId, message.threadId);
    stored.add(message.messageId);
    for (const reference of [...(message.references ?? []), message.inReplyTo ?? ""]) {
      if (reference && !byId.has(reference)) byId.set(reference, message.threadId);
    }
    if (message.subject) bySubject.set(normalizeSubject(message.subject), message.threadId);
  }

  const result = new Map<string, string>();
  const sorted = [...incoming].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  for (const message of sorted) {
    if (stored.has(message.messageId) || result.has(message.messageId)) {
      result.set(message.messageId, byId.get(message.messageId) ?? result.get(message.messageId)!);
      continue;
    }
    const parents = [message.inReplyTo, ...[...message.references].reverse()].filter((id): id is string => Boolean(id));
    const subjectKey = normalizeSubject(message.subject);
    const threadId =
      byId.get(message.messageId) ??
      parents.map((id) => byId.get(id)).find(Boolean) ??
      (isReplySubject(message.subject) && subjectKey ? bySubject.get(subjectKey) : undefined) ??
      threadIdFor(message.references[0] ?? message.inReplyTo ?? message.messageId);
    result.set(message.messageId, threadId);
    byId.set(message.messageId, threadId);
    for (const parent of parents) if (!byId.has(parent)) byId.set(parent, threadId);
    if (subjectKey) bySubject.set(subjectKey, threadId);
  }
  return result;
}

/* ---------- thread model ---------- */

export type ThreadState = "inbox" | "archived" | "trash";

export type Reminder = { at: string; setAt: string };

export type ThreadRecord = {
  id: string;
  subject: string;
  snippet: string;
  participants: MailAddress[];
  fromAddresses: string[];
  messageCount: number;
  lastMessageAt: string;
  state: ThreadState;
  starred: boolean;
  unread: boolean;
  labels: string[];
  snoozedUntil: string | null;
  reminder: Reminder | null;
  hasCalendarInvite: boolean;
  isNewsletter: boolean;
};

export type MailboxView = "inbox" | "snoozed" | "archived" | "trash";

export function isSnoozed(thread: Pick<ThreadRecord, "snoozedUntil" | "state">, now: Date) {
  return thread.state !== "trash" && Boolean(thread.snoozedUntil) && Date.parse(thread.snoozedUntil!) > now.getTime();
}

/** Follow-up is due when its date has passed and no message arrived after it was set. */
export function isReminderDue(thread: Pick<ThreadRecord, "reminder" | "lastMessageAt" | "state">, now: Date) {
  if (!thread.reminder || thread.state === "trash") return false;
  const dueAt = Date.parse(thread.reminder.at);
  const setAt = Date.parse(thread.reminder.setAt);
  return dueAt <= now.getTime() && Date.parse(thread.lastMessageAt) <= setAt;
}

export function hasReplySinceReminder(thread: Pick<ThreadRecord, "reminder" | "lastMessageAt">) {
  return Boolean(thread.reminder) && Date.parse(thread.lastMessageAt) > Date.parse(thread.reminder!.setAt);
}

export function threadView(thread: ThreadRecord, now: Date): MailboxView {
  if (thread.state === "trash") return "trash";
  if (isReminderDue(thread, now)) return "inbox";
  if (isSnoozed(thread, now)) return "snoozed";
  return thread.state === "archived" ? "archived" : "inbox";
}

export type ThreadAction =
  | { type: "archive" }
  | { type: "trash" }
  | { type: "restore" }
  | { type: "star"; value: boolean }
  | { type: "read"; value: boolean }
  | { type: "snooze"; until: string }
  | { type: "unsnooze" }
  | { type: "label"; label: string; value: boolean }
  | { type: "remind"; at: string }
  | { type: "clear-reminder" };

export class ThreadActionError extends Error {}

/** Returns the patch an action applies; validates against the current state and clock. */
export function applyThreadAction(thread: ThreadRecord, action: ThreadAction, now: Date): Partial<ThreadRecord> {
  switch (action.type) {
    case "archive":
      return { state: "archived", snoozedUntil: null, unread: false };
    case "trash":
      return { state: "trash", snoozedUntil: null };
    case "restore":
      return { state: "inbox", snoozedUntil: null };
    case "star":
      return { starred: action.value };
    case "read":
      return { unread: !action.value };
    case "snooze": {
      const until = Date.parse(action.until);
      if (!Number.isFinite(until) || until <= now.getTime()) throw new ThreadActionError("Snooze until a time in the future.");
      if (thread.state === "trash") throw new ThreadActionError("Restore the thread before snoozing it.");
      return { state: "inbox", snoozedUntil: new Date(until).toISOString() };
    }
    case "unsnooze":
      return { snoozedUntil: null };
    case "label": {
      const label = action.label.trim();
      if (!label) throw new ThreadActionError("Name the label.");
      const labels = new Set(thread.labels);
      if (action.value) labels.add(label);
      else labels.delete(label);
      return { labels: [...labels].sort((a, b) => a.localeCompare(b)) };
    }
    case "remind": {
      const at = Date.parse(action.at);
      if (!Number.isFinite(at) || at <= now.getTime()) throw new ThreadActionError("Pick a follow-up date in the future.");
      return { reminder: { at: new Date(at).toISOString(), setAt: now.toISOString() } };
    }
    case "clear-reminder":
      return { reminder: null };
  }
}

/** The action that reverses another (for keyboard undo). */
export function inverseAction(thread: ThreadRecord, action: ThreadAction): ThreadAction | null {
  switch (action.type) {
    case "archive":
    case "trash":
      return thread.state === "inbox" && !thread.snoozedUntil ? { type: "restore" } : thread.snoozedUntil ? { type: "snooze", until: thread.snoozedUntil } : { type: "restore" };
    case "star":
      return { type: "star", value: thread.starred };
    case "read":
      return { type: "read", value: !thread.unread };
    case "snooze":
      return thread.snoozedUntil ? { type: "snooze", until: thread.snoozedUntil } : { type: "unsnooze" };
    case "label":
      return { type: "label", label: action.label, value: thread.labels.includes(action.label) };
    default:
      return null;
  }
}

/* ---------- splits ---------- */

export const SPLIT_KINDS = ["from-domain", "from-address", "calendar-invite", "newsletter", "label", "subject-contains"] as const;
export type SplitKind = (typeof SPLIT_KINDS)[number];

export const SPLIT_KIND_LABELS: Record<SplitKind, string> = {
  "from-domain": "Sender domain",
  "from-address": "Sender address",
  "calendar-invite": "Has a calendar invite",
  newsletter: "Newsletters (List-Unsubscribe)",
  label: "Has label",
  "subject-contains": "Subject contains",
};

export type SplitRule = { id: string; name: string; kind: SplitKind; value: string; order: number };

export const PRIMARY_SPLIT = "primary";

export const DEFAULT_SPLITS: Omit<SplitRule, "id">[] = [
  { name: "Calendar", kind: "calendar-invite", value: "", order: 1 },
  { name: "News", kind: "newsletter", value: "", order: 2 },
];

export function splitNeedsValue(kind: SplitKind) {
  return kind !== "calendar-invite" && kind !== "newsletter";
}

export function matchesSplit(thread: Pick<ThreadRecord, "fromAddresses" | "hasCalendarInvite" | "isNewsletter" | "labels" | "subject">, rule: SplitRule) {
  const value = rule.value.trim().toLowerCase();
  switch (rule.kind) {
    case "calendar-invite":
      return thread.hasCalendarInvite;
    case "newsletter":
      return thread.isNewsletter;
    case "from-domain": {
      if (!value) return false;
      const domain = value.replace(/^@/, "");
      return thread.fromAddresses.some((email) => {
        const host = email.split("@")[1] ?? "";
        return host === domain || host.endsWith(`.${domain}`);
      });
    }
    case "from-address":
      return Boolean(value) && thread.fromAddresses.includes(value);
    case "label":
      return Boolean(value) && thread.labels.some((label) => label.toLowerCase() === value);
    case "subject-contains":
      return Boolean(value) && thread.subject.toLowerCase().includes(value);
  }
}

/** A thread belongs to the first matching split (by order); everything else is Primary. */
export function assignSplit(thread: ThreadRecord, rules: SplitRule[]) {
  const ordered = [...rules].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return ordered.find((rule) => matchesSplit(thread, rule))?.id ?? PRIMARY_SPLIT;
}

export function splitCounts(threads: ThreadRecord[], rules: SplitRule[], now: Date) {
  const counts: Record<string, { total: number; unread: number }> = { [PRIMARY_SPLIT]: { total: 0, unread: 0 } };
  for (const rule of rules) counts[rule.id] = { total: 0, unread: 0 };
  for (const thread of threads) {
    if (threadView(thread, now) !== "inbox") continue;
    const split = assignSplit(thread, rules);
    counts[split] ??= { total: 0, unread: 0 };
    counts[split].total += 1;
    if (thread.unread) counts[split].unread += 1;
  }
  return counts;
}

export function sortThreads(threads: ThreadRecord[]) {
  return [...threads].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

/* ---------- search ---------- */

export type SearchableMessage = {
  threadId: string;
  subject: string;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  text: string;
  date: string | null;
  hasCalendarInvite?: boolean;
  attachments?: { filename: string }[];
};

export type SearchHit = { threadId: string; score: number; snippet: string; date: string | null };

type ParsedQuery = { terms: string[]; from: string[]; to: string[]; subject: string[]; hasInvite: boolean; hasAttachment: boolean };

export function parseSearchQuery(query: string): ParsedQuery {
  const parsed: ParsedQuery = { terms: [], from: [], to: [], subject: [], hasInvite: false, hasAttachment: false };
  const tokens = query.match(/(\w+:)?"[^"]*"|\S+/g) ?? [];
  for (const token of tokens) {
    const match = /^(\w+):(.*)$/.exec(token);
    const clean = (value: string) => value.replace(/^"|"$/g, "").trim().toLowerCase();
    if (match) {
      const [, operator, rawValue] = match;
      const value = clean(rawValue);
      if (operator === "from" && value) parsed.from.push(value);
      else if ((operator === "to" || operator === "cc") && value) parsed.to.push(value);
      else if (operator === "subject" && value) parsed.subject.push(value);
      else if (operator === "has" && (value === "invite" || value === "calendar")) parsed.hasInvite = true;
      else if (operator === "has" && value === "attachment") parsed.hasAttachment = true;
      else if (clean(token)) parsed.terms.push(clean(token));
    } else if (clean(token)) parsed.terms.push(clean(token));
  }
  return parsed;
}

function addressText(address: MailAddress | null) {
  return address ? `${address.name} ${address.email}`.toLowerCase() : "";
}

export function snippetAround(text: string, term: string | undefined, radius = 60) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!term) return flat.slice(0, radius * 2);
  const index = flat.toLowerCase().indexOf(term);
  if (index < 0) return flat.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  return `${start > 0 ? "…" : ""}${flat.slice(start, index + term.length + radius)}${index + term.length + radius < flat.length ? "…" : ""}`;
}

/** In-memory search over a tenant mailbox. All terms must match; results grouped per thread. */
export function searchMessages(messages: SearchableMessage[], query: string, limit = 50): SearchHit[] {
  const parsed = parseSearchQuery(query);
  const empty = !parsed.terms.length && !parsed.from.length && !parsed.to.length && !parsed.subject.length && !parsed.hasInvite && !parsed.hasAttachment;
  if (empty) return [];
  const best = new Map<string, SearchHit>();
  for (const message of messages) {
    const subject = message.subject.toLowerCase();
    const from = addressText(message.from);
    const recipients = [...message.to, ...message.cc].map(addressText).join(" ");
    const body = message.text.toLowerCase();
    if (!parsed.from.every((value) => from.includes(value))) continue;
    if (!parsed.to.every((value) => recipients.includes(value))) continue;
    if (!parsed.subject.every((value) => subject.includes(value))) continue;
    if (parsed.hasInvite && !message.hasCalendarInvite) continue;
    if (parsed.hasAttachment && !(message.attachments?.length)) continue;
    let score = 0;
    let matchedAll = true;
    for (const term of parsed.terms) {
      const inSubject = subject.includes(term);
      const inFrom = from.includes(term) || recipients.includes(term);
      const inBody = body.includes(term);
      if (!inSubject && !inFrom && !inBody) {
        matchedAll = false;
        break;
      }
      score += (inSubject ? 5 : 0) + (inFrom ? 3 : 0) + (inBody ? 1 : 0);
    }
    if (!matchedAll) continue;
    score += parsed.from.length * 3 + parsed.subject.length * 5 + parsed.to.length * 2 + 1;
    const snippetTerm = parsed.terms.find((term) => body.includes(term));
    const hit: SearchHit = { threadId: message.threadId, score, snippet: snippetAround(message.text, snippetTerm), date: message.date };
    const previous = best.get(message.threadId);
    if (!previous || hit.score > previous.score || (hit.score === previous.score && (hit.date ?? "") > (previous.date ?? ""))) {
      best.set(message.threadId, hit);
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, limit);
}

/* ---------- compose helpers ---------- */

export function replySubject(subject: string) {
  return /^\s*re\s*:/i.test(subject) ? subject : `Re: ${subject || "(no subject)"}`;
}

export function quoteBody(text: string, from: MailAddress | null, date: string | null) {
  const who = from ? (from.name ? `${from.name} <${from.email}>` : from.email) : "the sender";
  const when = date ? new Date(date).toUTCString() : "an earlier date";
  const quoted = text
    .split("\n")
    .slice(0, 80)
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\nOn ${when}, ${who} wrote:\n${quoted}`;
}

export function formatAddress(address: MailAddress) {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}
