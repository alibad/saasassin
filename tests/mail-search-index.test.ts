import { describe, expect, it } from "vitest";

import { bodiesNeeded, buildSearchIndex, finishHits, rankIndexed, type IndexedMessage } from "../src/lib/mail/search-index";
import { searchMessages, type SearchableMessage } from "../src/lib/mail/workflow";

type Fixture = SearchableMessage & { key: string };

const people = [
  { name: "Ana Ruiz", email: "ana@acme.com" },
  { name: "Bob Stone", email: "bob@acme.com" },
  { name: "Jürgen Müller", email: "jurgen@example.de" },
  { name: "", email: "billing@vendor.io" },
  { name: "Weekly Letters", email: "news@letters.io" },
];

const bodies = [
  "Please find the invoice attached. Payment due in 30 days.",
  "Invoices for Q4 are late — can you check the re-sent copies?",
  "Let's plan the quarterly roadmap. The quarterly report is due Friday.",
  "Grüße aus München! Das Treffen ist am Dienstag um 10:00.",
  "Contact me at ana@acme.com or +1 (555) 010-0100 about the foo-bar migration.",
  "Unsubscribe from this list. Top stories: AI, chips, and the cloud_native trend.",
  "> quoted reply line\nNew text about budget_2026 and the budget sheet.",
  "",
  "Tracking pixel removed. Invoice #42 paid. Thanks!",
  "MIXED Case Words and ÉCOLE éducation naïve café",
];

function fixtures(): Fixture[] {
  const list: Fixture[] = [];
  for (let index = 0; index < 60; index += 1) {
    const from = people[index % people.length];
    const to = [people[(index + 1) % people.length]];
    const cc = index % 4 === 0 ? [people[(index + 2) % people.length]] : [];
    const day = String(1 + (index % 28)).padStart(2, "0");
    list.push({
      key: `m_${String(index).padStart(3, "0")}`,
      threadId: `t_${String(Math.floor(index / 3)).padStart(16, "0")}`,
      subject: ["Invoice 42", "Re: Q4 planning", "Weekly digest", "Treffen am Dienstag", "foo-bar migration", "Budget"][index % 6],
      from,
      to,
      cc,
      text: bodies[index % bodies.length] + (index % 7 === 0 ? ` Extra note ${index}.` : ""),
      // Duplicate dates on purpose: ties must break the same way.
      date: index % 11 === 0 ? null : `2026-10-${day}T0${index % 10}:00:00.000Z`,
      hasCalendarInvite: index % 9 === 0,
      attachments: index % 5 === 0 ? [{ filename: "file.pdf" }] : [],
    });
  }
  return list;
}

const QUERIES = [
  "invoice",
  "voice",
  "INVOICE paid",
  "quarterly report",
  "\"quarterly report\"",
  "\"report is due\"",
  "re-sent",
  "foo-bar",
  "ana@acme.com",
  "+1",
  "(555)",
  "10:00",
  "münchen",
  "grüße",
  "école",
  "cafe",
  "café",
  "naïve",
  "budget_2026",
  "cloud_native",
  "_",
  "--",
  "from:ana invoice",
  "from:\"bob stone\" quarterly",
  "to:jurgen",
  "cc:billing",
  "subject:digest",
  "subject:\"q4 planning\" roadmap",
  "has:attachment",
  "has:invite budget",
  "has:attachment has:invite",
  "extra",
  "note 14",
  "quoted",
  "nothing-matches-this",
  "a",
  "e",
  "",
  "   ",
  "unknown:operator",
  "from:",
];

function asIndexed(list: Fixture[], options: { unindexed?: Set<string> } = {}): IndexedMessage[] {
  return list.map((message) => ({
    key: message.key,
    threadId: message.threadId,
    subject: message.subject,
    from: message.from,
    to: message.to,
    cc: message.cc,
    date: message.date,
    hasCalendarInvite: message.hasCalendarInvite,
    attachments: message.attachments,
    searchTokens: options.unindexed?.has(message.key) ? null : buildSearchIndex(message.text).searchTokens,
  }));
}

/** The production pipeline with in-memory body reads, counting how many bodies it touched. */
function indexedSearch(list: Fixture[], entries: IndexedMessage[], query: string) {
  const textByKey = new Map(list.map((message) => [message.key, message.text]));
  const read = new Map<string, string>();
  for (const key of bodiesNeeded(entries, query)) read.set(key, textByKey.get(key)!);
  const verified = read.size;
  const ranked = rankIndexed(entries, query, read);
  for (const hit of ranked) if (!read.has(hit.key)) read.set(hit.key, textByKey.get(hit.key)!);
  return { hits: finishHits(ranked, read), verified, read: read.size };
}

describe("search token index", () => {
  const list = fixtures();

  it("returns exactly the full-scan results, ranking and snippets on every fixture query", () => {
    const entries = asIndexed(list);
    let withHits = 0;
    for (const query of QUERIES) {
      const expected = searchMessages(list, query);
      if (expected.length) withHits += 1;
      expect(indexedSearch(list, entries, query).hits, query).toEqual(expected);
    }
    expect(withHits).toBeGreaterThan(25);
  });

  it("matches the full scan when some messages have no index yet", () => {
    const entries = asIndexed(list, { unindexed: new Set(list.filter((_, index) => index % 3 === 1).map((message) => message.key)) });
    for (const query of QUERIES) {
      expect(indexedSearch(list, entries, query).hits, query).toEqual(searchMessages(list, query));
    }
  });

  it("matches with a small result limit", () => {
    const entries = asIndexed(list);
    for (const query of ["invoice", "a", "budget"]) {
      const ranked = rankIndexed(entries, query, new Map(), 3);
      const texts = new Map(list.map((message) => [message.key, message.text]));
      expect(finishHits(ranked, texts), query).toEqual(searchMessages(list, query, 3));
    }
  });

  it("reads no bodies to decide plain-word queries, only the winners' snippets", () => {
    const entries = asIndexed(list);
    const plain = indexedSearch(list, entries, "invoice paid");
    expect(plain.verified).toBe(0);
    expect(plain.read).toBe(plain.hits.length);
    const phrase = indexedSearch(list, entries, "\"quarterly report\"");
    expect(phrase.verified).toBeGreaterThan(0);
    expect(phrase.verified).toBeLessThan(list.length);
    expect(indexedSearch(list, entries, "zzz-nope").verified).toBe(0);
  });

  it("indexes unique lower-cased word runs", () => {
    expect(buildSearchIndex("Hello, HELLO world_2 — café-bar!")).toEqual({ searchTokens: "hello world_2 café bar", searchIndexVersion: 1, searchIndexComplete: true });
    expect(buildSearchIndex("")).toMatchObject({ searchTokens: "", searchIndexComplete: true });
  });
});
