/**
 * In-memory full-text search over one project's tenant-scoped records.
 * Callers must load the records only after verifying membership; this module never touches storage.
 */

import type { Highlight, Insight, Source } from "./model";
import { formatTimestamp } from "./transcript";

export type SearchDocType = "insight" | "highlight" | "segment" | "source";

export type SearchDoc = {
  type: SearchDocType;
  id: string;
  title: string;
  body: string;
  tags: string[];
  sourceId?: string;
  segmentId?: string;
  context?: string;
};

export type SearchResult = SearchDoc & { score: number; snippet: string; matchedTerms: string[] };

const TYPE_WEIGHT: Record<SearchDocType, number> = { insight: 1.3, highlight: 1.2, segment: 1, source: 0.9 };
const STOPWORDS = new Set(["a", "an", "the", "and", "or", "of", "to", "in", "on", "is", "it", "for", "with", "be", "we", "i"]);

export function normalize(text: string) {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function tokenize(text: string) {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

function countTerm(tokens: string[], term: string) {
  let count = 0;
  for (const token of tokens) if (token === term || (term.length >= 3 && token.startsWith(term))) count += 1;
  return count;
}

export function buildSnippet(body: string, terms: string[], radius = 70) {
  const lower = normalize(body);
  let index = -1;
  for (const term of terms) {
    const found = lower.indexOf(term);
    if (found !== -1 && (index === -1 || found < index)) index = found;
  }
  if (index === -1) return body.slice(0, radius * 2) + (body.length > radius * 2 ? "…" : "");
  const start = Math.max(0, index - radius);
  const end = Math.min(body.length, index + radius);
  return `${start > 0 ? "…" : ""}${body.slice(start, end)}${end < body.length ? "…" : ""}`;
}

export function rankDocuments(query: string, docs: SearchDoc[], limit = 50): SearchResult[] {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];
  const phrase = normalize(query.trim());
  const results: SearchResult[] = [];

  for (const doc of docs) {
    const titleTokens = tokenize(doc.title);
    const bodyTokens = tokenize(doc.body);
    const tagTokens = doc.tags.flatMap(tokenize);
    let score = 0;
    const matched: string[] = [];
    for (const term of terms) {
      const termScore =
        countTerm(titleTokens, term) * 3 + countTerm(tagTokens, term) * 2.5 + Math.min(countTerm(bodyTokens, term), 5);
      if (termScore > 0) matched.push(term);
      score += termScore;
    }
    if (matched.length === 0) continue;
    score *= matched.length / terms.length;
    if (terms.length > 1 && matched.length === terms.length) score += 2;
    if (phrase.length > 2 && (normalize(doc.body).includes(phrase) || normalize(doc.title).includes(phrase))) score += 5;
    score *= TYPE_WEIGHT[doc.type];
    results.push({ ...doc, score: Math.round(score * 100) / 100, snippet: buildSnippet(doc.body || doc.title, matched), matchedTerms: matched });
  }

  const typeOrder: SearchDocType[] = ["insight", "highlight", "segment", "source"];
  return results
    .sort((a, b) => b.score - a.score || typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export function buildSearchDocs(input: { sources: Source[]; highlights: Highlight[]; insights: Insight[] }): SearchDoc[] {
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const docs: SearchDoc[] = [];
  for (const source of input.sources) {
    docs.push({
      type: "source",
      id: source.id,
      title: source.title,
      body: [source.participant.name, source.participant.company].filter(Boolean).join(" · "),
      tags: [],
      sourceId: source.id,
    });
    for (const segment of source.segments) {
      docs.push({
        type: "segment",
        id: `${source.id}:${segment.id}`,
        title: `${source.title} — ${segment.speaker}`,
        body: segment.text,
        tags: [],
        sourceId: source.id,
        segmentId: segment.id,
        context: formatTimestamp(segment.startMs),
      });
    }
  }
  for (const highlight of input.highlights) {
    if (!sourceById.has(highlight.sourceId)) continue;
    docs.push({
      type: "highlight",
      id: highlight.id,
      title: sourceById.get(highlight.sourceId)?.title ?? "Highlight",
      body: [highlight.quote, highlight.note].filter(Boolean).join(" — "),
      tags: highlight.tags,
      sourceId: highlight.sourceId,
      segmentId: highlight.segmentId,
    });
  }
  for (const insight of input.insights) {
    docs.push({ type: "insight", id: insight.id, title: insight.title, body: insight.body, tags: [] });
  }
  return docs;
}
