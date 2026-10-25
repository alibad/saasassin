import { parse } from "csv-parse/sync";

import { slugify, type PostStatus } from "./model";

/**
 * Canny posts-CSV mapper (pure). Canny's admin export produces one row per post with
 * headers such as Board, Title, Details, Status, Author Name, Author Email, Votes,
 * Created At, Tags and URL. Header matching is case/spacing-insensitive and tolerates
 * the common variants so older exports still map. Nothing is written here: the result
 * is a preview with per-row problems that a commit step can apply idempotently using
 * `sourceKey`.
 */

export type CannyMappedPost = {
  line: number;
  sourceKey: string;
  board: string;
  boardSlug: string;
  title: string;
  description: string;
  status: PostStatus;
  cannyStatus: string;
  authorName: string;
  authorEmail: string;
  voteCount: number;
  tags: string[];
  createdAt: string | null;
  sourceUrl: string;
};

export type CannyMapResult = {
  posts: CannyMappedPost[];
  boards: { slug: string; name: string; posts: number }[];
  problems: { line: number; message: string }[];
  unmappedHeaders: string[];
};

const STATUS_MAP: Record<string, PostStatus> = {
  open: "open",
  "under review": "open",
  "needs review": "open",
  planned: "planned",
  "in progress": "started",
  started: "started",
  complete: "completed",
  completed: "completed",
  shipped: "completed",
  closed: "declined",
  declined: "declined",
  merged: "duplicate",
};

const HEADER_ALIASES: Record<string, string[]> = {
  board: ["board", "board name"],
  title: ["title", "post title"],
  description: ["details", "description", "body", "post details"],
  status: ["status"],
  authorName: ["author name", "author", "created by"],
  authorEmail: ["author email", "email"],
  votes: ["votes", "vote count", "score"],
  tags: ["tags", "tag"],
  createdAt: ["created at", "created", "date"],
  url: ["url", "post url", "link"],
  id: ["id", "post id"],
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[_\s]+/g, " ");
}

export function mapCannyRecords(records: Record<string, string>[]): CannyMapResult {
  const problems: CannyMapResult["problems"] = [];
  const headers = records[0] ? Object.keys(records[0]) : [];
  const resolved: Record<string, string | undefined> = {};
  const used = new Set<string>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const match = headers.find((header) => aliases.includes(normalizeHeader(header)));
    if (match) {
      resolved[field] = match;
      used.add(match);
    }
  }
  const unmappedHeaders = headers.filter((header) => !used.has(header));
  if (records.length && !resolved.title) {
    return { posts: [], boards: [], problems: [{ line: 1, message: "No Title column found; is this a Canny posts export?" }], unmappedHeaders };
  }

  const get = (row: Record<string, string>, field: string) => (resolved[field] ? String(row[resolved[field]!] ?? "").trim() : "");
  const posts: CannyMappedPost[] = [];
  const seen = new Set<string>();

  records.forEach((row, index) => {
    const line = index + 2; // header is line 1
    const title = get(row, "title");
    if (!title) {
      problems.push({ line, message: "Missing title; row skipped." });
      return;
    }
    const board = get(row, "board") || "Imported";
    const rawStatus = get(row, "status").toLowerCase();
    let status = STATUS_MAP[rawStatus];
    if (!status) {
      if (rawStatus) problems.push({ line, message: `Unknown Canny status "${rawStatus}" imported as open.` });
      status = "open";
    }
    if (status === "duplicate") {
      problems.push({ line, message: "Merged in Canny; imported as open so it can be merged again with its votes." });
      status = "open";
    }
    const votesRaw = get(row, "votes");
    let voteCount = 0;
    if (votesRaw) {
      const parsed = Number.parseInt(votesRaw.replace(/,/g, ""), 10);
      if (Number.isFinite(parsed) && parsed >= 0) voteCount = parsed;
      else problems.push({ line, message: `Vote count "${votesRaw}" is not a number; imported as 0.` });
    }
    const createdRaw = get(row, "createdAt");
    let createdAt: string | null = null;
    if (createdRaw) {
      const time = Date.parse(createdRaw);
      if (Number.isNaN(time)) problems.push({ line, message: `Date "${createdRaw}" could not be read; import time is used.` });
      else createdAt = new Date(time).toISOString();
    }
    const authorEmail = get(row, "authorEmail").toLowerCase();
    if (authorEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(authorEmail)) {
      problems.push({ line, message: `Author email "${authorEmail}" looks invalid; kept as provenance only.` });
    }
    const sourceUrl = get(row, "url");
    const sourceKey = get(row, "id") || sourceUrl || `${slugify(board)}:${slugify(title)}:${createdAt ?? ""}`;
    if (seen.has(sourceKey)) {
      problems.push({ line, message: "Duplicate row for the same Canny post; skipped." });
      return;
    }
    seen.add(sourceKey);
    posts.push({
      line,
      sourceKey,
      board,
      boardSlug: slugify(board),
      title: title.slice(0, 160),
      description: get(row, "description"),
      status,
      cannyStatus: rawStatus || "open",
      authorName: get(row, "authorName") || "Canny user",
      authorEmail,
      voteCount,
      tags: get(row, "tags").split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean),
      createdAt,
      sourceUrl,
    });
  });

  const boards = new Map<string, { slug: string; name: string; posts: number }>();
  for (const post of posts) {
    const entry = boards.get(post.boardSlug) ?? { slug: post.boardSlug, name: post.board, posts: 0 };
    entry.posts += 1;
    boards.set(post.boardSlug, entry);
  }

  return { posts, boards: [...boards.values()], problems, unmappedHeaders };
}

/** Deterministic post id for an imported Canny row, so re-running an import never duplicates posts. */
export function importedPostId(sourceKey: string) {
  let hash = 0x811c9dc5;
  let hash2 = 0x01000193;
  for (let index = 0; index < sourceKey.length; index += 1) {
    const code = sourceKey.charCodeAt(index);
    hash = Math.imul(hash ^ code, 0x01000193) >>> 0;
    hash2 = Math.imul(hash2 ^ code, 0x5bd1e995) >>> 0;
  }
  return `canny_${hash.toString(16).padStart(8, "0")}${hash2.toString(16).padStart(8, "0")}`;
}

export function mapCannyCsv(csv: string): CannyMapResult {
  let records: Record<string, string>[];
  try {
    records = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
  } catch (error) {
    return { posts: [], boards: [], problems: [{ line: 0, message: `The CSV could not be parsed: ${(error as Error).message}` }], unmappedHeaders: [] };
  }
  return mapCannyRecords(records);
}
