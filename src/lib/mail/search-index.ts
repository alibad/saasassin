/**
 * Per-message search index, stored with each message at import so search reads a compact token
 * string instead of every message body. Results are identical to the full-scan `searchMessages`
 * (the reference implementation, kept in workflow.ts and compared in tests):
 *
 * - The index is the set of maximal letter/digit/underscore runs of the lower-cased body, joined by
 *   spaces. A query term made only of those characters occurs in the body exactly when it occurs
 *   inside one run, i.e. when `tokens.includes(term)` — no body needed.
 * - A term with any other character (a phrase, an address, "foo-bar") cannot be decided from tokens
 *   alone. Its pieces must each appear in the tokens (a necessary condition), and only messages
 *   passing that pre-check are verified against their body.
 * - Messages without a current index (imported before it existed) fall back to their body.
 * - Snippets need the original text, so only the winning message of each returned thread is read.
 */
import type { MailAddress } from "./mime";
import { parseSearchQuery, snippetAround, type SearchHit } from "./workflow";

export const SEARCH_INDEX_VERSION = 1;
const TOKEN = /[\p{L}\p{N}_]+/gu;
const SIMPLE_TERM = /^[\p{L}\p{N}_]+$/u;
const MAX_INDEX_CHARS = 400_000;

export type SearchIndexFields = { searchTokens: string; searchIndexVersion: number; searchIndexComplete: boolean };

export function buildSearchIndex(text: string): SearchIndexFields {
  const tokens = [...new Set(text.toLowerCase().match(TOKEN) ?? [])];
  const joined = tokens.join(" ");
  // A cut-off index could miss words, so it is flagged and those messages are verified on the body.
  return joined.length <= MAX_INDEX_CHARS
    ? { searchTokens: joined, searchIndexVersion: SEARCH_INDEX_VERSION, searchIndexComplete: true }
    : { searchTokens: joined.slice(0, MAX_INDEX_CHARS), searchIndexVersion: SEARCH_INDEX_VERSION, searchIndexComplete: false };
}

export type IndexedMessage = {
  key: string;
  threadId: string;
  subject: string;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  date: string | null;
  hasCalendarInvite?: boolean;
  attachments?: { filename: string }[];
  /** Null when the message has no complete, current index: its body decides. */
  searchTokens: string | null;
};

export type RankedHit = Omit<SearchHit, "snippet"> & { key: string; snippetTerm: string | undefined };

function addressText(address: MailAddress | null) {
  return address ? `${address.name} ${address.email}`.toLowerCase() : "";
}

function isEmpty(parsed: ReturnType<typeof parseSearchQuery>) {
  return !parsed.terms.length && !parsed.from.length && !parsed.to.length && !parsed.subject.length && !parsed.hasInvite && !parsed.hasAttachment;
}

function passesOperators(entry: IndexedMessage, parsed: ReturnType<typeof parseSearchQuery>) {
  const subject = entry.subject.toLowerCase();
  const from = addressText(entry.from);
  const recipients = [...entry.to, ...entry.cc].map(addressText).join(" ");
  return (
    parsed.from.every((value) => from.includes(value)) &&
    parsed.to.every((value) => recipients.includes(value)) &&
    parsed.subject.every((value) => subject.includes(value)) &&
    (!parsed.hasInvite || Boolean(entry.hasCalendarInvite)) &&
    (!parsed.hasAttachment || Boolean(entry.attachments?.length))
  );
}

function mayContain(tokens: string, term: string) {
  const pieces = term.match(TOKEN) ?? [];
  return pieces.every((piece) => tokens.includes(piece));
}

/** Which message bodies must be read to answer this query exactly (usually none). */
export function bodiesNeeded(entries: IndexedMessage[], query: string): string[] {
  const parsed = parseSearchQuery(query);
  if (isEmpty(parsed)) return [];
  const complex = parsed.terms.filter((term) => !SIMPLE_TERM.test(term));
  return entries
    .filter((entry) => {
      if (!passesOperators(entry, parsed)) return false;
      if (entry.searchTokens === null) return parsed.terms.length > 0;
      return complex.some((term) => mayContain(entry.searchTokens!, term));
    })
    .map((entry) => entry.key);
}

/** Same scoring, filtering and per-thread grouping as searchMessages; snippets are filled later. */
export function rankIndexed(entries: IndexedMessage[], query: string, bodies: Map<string, string>, limit = 50): RankedHit[] {
  const parsed = parseSearchQuery(query);
  if (isEmpty(parsed)) return [];
  const best = new Map<string, RankedHit>();
  for (const entry of entries) {
    if (!passesOperators(entry, parsed)) continue;
    const subject = entry.subject.toLowerCase();
    const from = addressText(entry.from);
    const recipients = [...entry.to, ...entry.cc].map(addressText).join(" ");
    const body = bodies.get(entry.key)?.toLowerCase();
    const inBody = (term: string) => {
      if (entry.searchTokens !== null && SIMPLE_TERM.test(term)) return entry.searchTokens.includes(term);
      return body !== undefined && body.includes(term);
    };
    let score = 0;
    let matchedAll = true;
    for (const term of parsed.terms) {
      const inSubject = subject.includes(term);
      const inFrom = from.includes(term) || recipients.includes(term);
      const bodyHit = inBody(term);
      if (!inSubject && !inFrom && !bodyHit) {
        matchedAll = false;
        break;
      }
      score += (inSubject ? 5 : 0) + (inFrom ? 3 : 0) + (bodyHit ? 1 : 0);
    }
    if (!matchedAll) continue;
    score += parsed.from.length * 3 + parsed.subject.length * 5 + parsed.to.length * 2 + 1;
    const hit: RankedHit = { threadId: entry.threadId, score, date: entry.date, key: entry.key, snippetTerm: parsed.terms.find(inBody) };
    const previous = best.get(entry.threadId);
    if (!previous || hit.score > previous.score || (hit.score === previous.score && (hit.date ?? "") > (previous.date ?? ""))) best.set(entry.threadId, hit);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || (b.date ?? "").localeCompare(a.date ?? "")).slice(0, limit);
}

/** Snippets come from the original (not lower-cased) text of each winning message. */
export function finishHits(ranked: RankedHit[], texts: Map<string, string>): SearchHit[] {
  return ranked.map((hit) => ({ threadId: hit.threadId, score: hit.score, date: hit.date, snippet: snippetAround(texts.get(hit.key) ?? "", hit.snippetTerm) }));
}
