/**
 * Pure filter rule engine: user-defined conditions on a message → actions on its thread.
 * Runs on import (every new message), in "test against existing mail" previews and in an
 * explicit retro-apply. No I/O — shared by the server, the UI and tests.
 */
import type { MailAddress } from "./mime";
import type { ThreadRecord } from "./workflow";

export const FILTER_FIELDS = ["from", "to", "subject", "list-id", "has-attachment"] as const;
export type FilterField = (typeof FILTER_FIELDS)[number];

export const FILTER_FIELD_LABELS: Record<FilterField, string> = {
  from: "From contains",
  to: "To / Cc contains",
  subject: "Subject contains",
  "list-id": "Mailing list (List-Id) contains",
  "has-attachment": "Has an attachment",
};

export type FilterCondition = { field: FilterField; value: string };

export type FilterActions = {
  label: string | null;
  archive: boolean;
  star: boolean;
  markRead: boolean;
  skipInbox: boolean;
};

export type FilterRule = {
  id: string;
  name: string;
  match: "all" | "any";
  conditions: FilterCondition[];
  actions: FilterActions;
  enabled: boolean;
  order: number;
};

/** The message facts a filter can see; stored messages and freshly parsed ones both fit. */
export type FilterableMessage = {
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  listId?: string | null;
  attachments?: { filename: string }[];
};

export function conditionNeedsValue(field: FilterField) {
  return field !== "has-attachment";
}

function addressText(address: MailAddress | null) {
  return address ? `${address.name} <${address.email}>`.toLowerCase() : "";
}

export function matchesCondition(condition: FilterCondition, message: FilterableMessage) {
  const value = condition.value.trim().toLowerCase();
  switch (condition.field) {
    case "from":
      return Boolean(value) && addressText(message.from).includes(value);
    case "to":
      return Boolean(value) && [...message.to, ...message.cc].some((address) => addressText(address).includes(value));
    case "subject":
      return Boolean(value) && message.subject.toLowerCase().includes(value);
    case "list-id":
      return Boolean(value) && (message.listId ?? "").toLowerCase().includes(value);
    case "has-attachment":
      return value === "no" ? !message.attachments?.length : Boolean(message.attachments?.length);
  }
}

export function matchesFilter(rule: Pick<FilterRule, "match" | "conditions">, message: FilterableMessage) {
  if (!rule.conditions.length) return false;
  return rule.match === "any"
    ? rule.conditions.some((condition) => matchesCondition(condition, message))
    : rule.conditions.every((condition) => matchesCondition(condition, message));
}

export type FilterOutcome = FilterActions & { labels: string[]; matched: string[] };

export const NO_FILTER_OUTCOME: FilterOutcome = { label: null, labels: [], archive: false, star: false, markRead: false, skipInbox: false, matched: [] };

/** Every enabled rule that matches contributes its actions (in order); labels accumulate. */
export function filterOutcome(rules: FilterRule[], message: FilterableMessage): FilterOutcome {
  const outcome: FilterOutcome = { ...NO_FILTER_OUTCOME, labels: [], matched: [] };
  for (const rule of [...rules].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))) {
    if (!rule.enabled || !matchesFilter(rule, message)) continue;
    outcome.matched.push(rule.id);
    if (rule.actions.label && !outcome.labels.includes(rule.actions.label)) outcome.labels.push(rule.actions.label);
    outcome.archive ||= rule.actions.archive;
    outcome.star ||= rule.actions.star;
    outcome.markRead ||= rule.actions.markRead;
    outcome.skipInbox ||= rule.actions.skipInbox;
  }
  return outcome;
}

type ArrivalThread = Pick<ThreadRecord, "state" | "unread" | "snoozedUntil" | "labels" | "starred" | "muted">;

/**
 * How one newly imported message changes its thread. New mail normally brings a thread back:
 * out of Done and snooze (Trash stays Trash) and unread. A muted thread, or a filter that skips
 * the inbox, keeps the thread where it is (a brand-new thread lands in Done); "archive" always
 * moves it to Done; "mark read" leaves the unread flag as it was.
 */
export function applyArrival<T extends ArrivalThread>(thread: T, outcome: FilterOutcome, isNewThread: boolean): T {
  const next = { ...thread };
  if (!outcome.markRead) next.unread = true;
  if (outcome.star) next.starred = true;
  if (outcome.labels.length) next.labels = [...new Set([...next.labels, ...outcome.labels])].sort((a, b) => a.localeCompare(b));
  if (next.state === "trash") return next;
  const stayPut = outcome.skipInbox || Boolean(thread.muted);
  if (outcome.archive || (stayPut && isNewThread)) {
    next.state = "archived";
  } else if (!stayPut) {
    if (next.state === "archived") next.state = "inbox";
    next.snoozedUntil = null;
  }
  return next;
}

/** The patch a retro-apply writes to an existing thread; never touches Trash. Null = no change. */
export function retroPatch(thread: Pick<ThreadRecord, "state" | "unread" | "labels" | "starred">, outcome: FilterOutcome): Partial<ThreadRecord> | null {
  if (!outcome.matched.length || thread.state === "trash") return null;
  const patch: Partial<ThreadRecord> = {};
  const labels = [...new Set([...thread.labels, ...outcome.labels])].sort((a, b) => a.localeCompare(b));
  if (labels.length !== thread.labels.length) patch.labels = labels;
  if (outcome.star && !thread.starred) patch.starred = true;
  if (outcome.markRead && thread.unread) patch.unread = false;
  if ((outcome.archive || outcome.skipInbox) && thread.state === "inbox") patch.state = "archived";
  return Object.keys(patch).length ? patch : null;
}

export function describeConditions(rule: Pick<FilterRule, "match" | "conditions">) {
  const parts = rule.conditions.map((condition) =>
    condition.field === "has-attachment"
      ? condition.value === "no" ? "has no attachment" : "has an attachment"
      : `${condition.field} contains “${condition.value}”`,
  );
  return parts.join(rule.match === "any" ? " or " : " and ");
}

export function describeActions(actions: FilterActions) {
  const parts: string[] = [];
  if (actions.label) parts.push(`label “${actions.label}”`);
  if (actions.star) parts.push("star");
  if (actions.markRead) parts.push("mark read");
  if (actions.archive) parts.push("archive");
  if (actions.skipInbox) parts.push("skip the inbox");
  return parts.join(", ") || "no action";
}
