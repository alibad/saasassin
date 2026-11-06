import { z } from "zod";

/**
 * Circle → SaaSassin Community migration mapper. Pure: no Firestore, no clock unless passed in,
 * so preview and commit run the exact same mapping and every rule is unit-tested.
 *
 * Circle's members and posts exports are CSV. Column names vary between export versions, so each
 * field accepts a few header aliases (matched case- and punctuation-insensitively).
 * Imported members become *pending invites* — no accounts are created and nobody is emailed.
 */

export const CIRCLE_LIMITS = { members: 5000, posts: 2000, csvBytes: 2_000_000 };
export const IMPORTED_SPACE_FALLBACK = "Imported from Circle";

export const circleImportSchema = z.object({
  membersCsv: z.string().max(CIRCLE_LIMITS.csvBytes, "The members file is larger than 2 MB.").default(""),
  postsCsv: z.string().max(CIRCLE_LIMITS.csvBytes, "The posts file is larger than 2 MB.").default(""),
  commit: z.boolean().default(false),
});

/** RFC 4180 CSV: quoted fields, escaped quotes, embedded newlines, CRLF or LF, optional BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

const normalizeHeader = (header: string) => header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function tableFrom(csv: string) {
  const [header = [], ...body] = parseCsv(csv);
  const columns = header.map(normalizeHeader);
  return {
    columns,
    rows: body.map((cells, index) => ({ row: index + 2, get: (aliases: string[]) => {
      for (const alias of aliases) {
        const at = columns.indexOf(alias);
        if (at >= 0 && cells[at]?.trim()) return cells[at].trim();
      }
      return "";
    } })),
  };
}

const MEMBER_COLUMNS = {
  email: ["email", "email address", "member email", "user email"],
  name: ["name", "full name", "member name"],
  firstName: ["first name", "firstname"],
  lastName: ["last name", "lastname", "surname"],
  headline: ["headline", "title", "tagline"],
  bio: ["bio", "about", "about me"],
  joinedAt: ["joined at", "joined", "created at", "member since", "signed up at"],
  tags: ["member tags", "tags"],
};

const POST_COLUMNS = {
  title: ["title", "post title", "name", "post name"],
  body: ["body", "content", "post body", "body text", "text", "post content"],
  space: ["space", "space name", "space title", "community space"],
  authorEmail: ["author email", "user email", "member email", "email", "posted by email"],
  authorName: ["author", "author name", "user name", "member name", "posted by"],
  createdAt: ["created at", "published at", "posted at", "date", "created"],
};

const EMAIL = z.string().email();

function isoOrNull(value: string) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/** Two independent 32-bit hashes → 16 hex chars. Deterministic ids make re-running an import a no-op. */
export function stableHash(value: string) {
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    fnv = Math.imul(fnv ^ code, 0x01000193) >>> 0;
    djb = (Math.imul(djb, 33) + code) >>> 0;
  }
  return fnv.toString(16).padStart(8, "0") + djb.toString(16).padStart(8, "0");
}

export const inviteDocId = (email: string) => `inv_${stableHash(email.trim().toLowerCase())}`;
/** Placeholder author for imported posts by someone who has not joined yet; re-pointed when they join with that email. */
export const placeholderAuthorUid = (email: string) => `circle_${stableHash(email.trim().toLowerCase())}`;

export type PendingInvite = {
  id: string;
  email: string;
  name: string;
  headline: string;
  bio: string;
  joinedCircleAt: string | null;
  tags: string[];
};

export type ImportedPost = {
  id: string;
  row: number;
  title: string;
  body: string;
  spaceName: string;
  authorUid: string;
  authorName: string;
  createdAt: string;
};

export type Skipped = { row: number; reason: string };

export type CircleMapping = {
  invites: PendingInvite[];
  posts: ImportedPost[];
  spacesToCreate: string[];
  spaceIdsByName: Record<string, string | null>;
  report: {
    members: { total: number; toInvite: number; alreadyMembers: number; alreadyInvited: number; skipped: Skipped[] };
    posts: { total: number; toImport: number; alreadyImported: number; skipped: Skipped[] };
    spaces: { matched: { name: string; spaceId: string }[]; toCreate: string[] };
    authors: { members: number; invitees: number; unknown: number };
    warnings: string[];
  };
};

export type ExistingCommunity = {
  /** lowercase email → uid, active members only */
  memberEmails: Map<string, string>;
  /** lowercase emails already pending */
  pendingEmails: Set<string>;
  spaces: { id: string; name: string }[];
  importedPostIds: Set<string>;
};

const spaceKey = (name: string) => name.trim().toLowerCase();

export function mapCircleImport(input: { membersCsv: string; postsCsv: string }, existing: ExistingCommunity, now: Date): CircleMapping {
  const warnings: string[] = [];
  const memberSkipped: Skipped[] = [];
  const invites: PendingInvite[] = [];
  const invitedNames = new Map<string, string>();
  let alreadyMembers = 0;
  let alreadyInvited = 0;
  let memberTotal = 0;

  if (input.membersCsv.trim()) {
    const table = tableFrom(input.membersCsv);
    if (!MEMBER_COLUMNS.email.some((alias) => table.columns.includes(alias))) {
      warnings.push("The members file has no Email column, so no members could be mapped.");
    }
    memberTotal = table.rows.length;
    if (memberTotal > CIRCLE_LIMITS.members) {
      warnings.push(`Only the first ${CIRCLE_LIMITS.members} of ${memberTotal} member rows are imported in one run.`);
    }
    const seen = new Set<string>();
    for (const row of table.rows.slice(0, CIRCLE_LIMITS.members)) {
      const email = row.get(MEMBER_COLUMNS.email).toLowerCase();
      if (!email) { memberSkipped.push({ row: row.row, reason: "No email address" }); continue; }
      if (!EMAIL.safeParse(email).success) { memberSkipped.push({ row: row.row, reason: "Email address is not valid" }); continue; }
      if (seen.has(email)) { memberSkipped.push({ row: row.row, reason: "Duplicate email in this file" }); continue; }
      seen.add(email);
      const name = (row.get(MEMBER_COLUMNS.name) || [row.get(MEMBER_COLUMNS.firstName), row.get(MEMBER_COLUMNS.lastName)].filter(Boolean).join(" ")).slice(0, 80);
      invitedNames.set(email, name);
      if (existing.memberEmails.has(email)) { alreadyMembers += 1; continue; }
      if (existing.pendingEmails.has(email)) { alreadyInvited += 1; continue; }
      invites.push({
        id: inviteDocId(email),
        email,
        name,
        headline: row.get(MEMBER_COLUMNS.headline).slice(0, 120),
        bio: row.get(MEMBER_COLUMNS.bio).slice(0, 1000),
        joinedCircleAt: isoOrNull(row.get(MEMBER_COLUMNS.joinedAt)),
        tags: row.get(MEMBER_COLUMNS.tags).split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
      });
    }
  }

  const postSkipped: Skipped[] = [];
  const posts: ImportedPost[] = [];
  const spacesByKey = new Map(existing.spaces.map((space) => [spaceKey(space.name), space]));
  const spaceIdsByName: Record<string, string | null> = {};
  const authors = { members: 0, invitees: 0, unknown: 0 };
  let alreadyImported = 0;
  let postTotal = 0;
  let undated = 0;

  if (input.postsCsv.trim()) {
    const table = tableFrom(input.postsCsv);
    postTotal = table.rows.length;
    if (postTotal > CIRCLE_LIMITS.posts) warnings.push(`Only the first ${CIRCLE_LIMITS.posts} of ${postTotal} post rows are imported in one run.`);
    const seen = new Set<string>();
    for (const row of table.rows.slice(0, CIRCLE_LIMITS.posts)) {
      const body = row.get(POST_COLUMNS.body);
      const rawTitle = row.get(POST_COLUMNS.title);
      if (!body && !rawTitle) { postSkipped.push({ row: row.row, reason: "No title or body" }); continue; }
      const title = (rawTitle || body.split(/\r?\n/)[0] || "Untitled").slice(0, 160);
      const spaceName = (row.get(POST_COLUMNS.space) || IMPORTED_SPACE_FALLBACK).slice(0, 60);
      const authorEmail = row.get(POST_COLUMNS.authorEmail).toLowerCase();
      const parsedAt = isoOrNull(row.get(POST_COLUMNS.createdAt));
      if (!parsedAt) undated += 1;
      const createdAt = parsedAt ?? now.toISOString();
      const id = `circle_${stableHash([spaceKey(spaceName), title, parsedAt ?? "", authorEmail, body.slice(0, 500)].join("␟"))}`;
      if (seen.has(id)) { postSkipped.push({ row: row.row, reason: "Duplicate post in this file" }); continue; }
      seen.add(id);
      if (existing.importedPostIds.has(id)) { alreadyImported += 1; continue; }

      let authorUid: string;
      let authorName = row.get(POST_COLUMNS.authorName).slice(0, 80);
      const memberUid = authorEmail ? existing.memberEmails.get(authorEmail) : undefined;
      if (memberUid) {
        authorUid = memberUid;
        authors.members += 1;
      } else if (authorEmail && EMAIL.safeParse(authorEmail).success) {
        authorUid = placeholderAuthorUid(authorEmail);
        authorName = authorName || invitedNames.get(authorEmail) || "Circle member";
        authors.invitees += 1;
      } else {
        authorUid = "circle_unknown";
        authorName = authorName || "Former Circle member";
        authors.unknown += 1;
      }
      if (!(spaceKey(spaceName) in spaceIdsByName)) spaceIdsByName[spaceKey(spaceName)] = spacesByKey.get(spaceKey(spaceName))?.id ?? null;
      posts.push({ id, row: row.row, title, body: (body || title).slice(0, 10000), spaceName, authorUid, authorName, createdAt });
    }
  }
  if (undated) warnings.push(`${undated} ${undated === 1 ? "post has" : "posts have"} no readable date and will be dated at import time.`);

  const toCreate = [...new Set(posts.filter((post) => !spaceIdsByName[spaceKey(post.spaceName)]).map((post) => post.spaceName))];
  const matched = Object.entries(spaceIdsByName)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, spaceId]) => ({ name: spacesByKey.get(key)?.name ?? key, spaceId }));
  if (toCreate.length) warnings.push("New spaces are created private (owners and admins only) so you can review imported posts before opening them.");

  return {
    invites,
    posts,
    spacesToCreate: toCreate,
    spaceIdsByName,
    report: {
      members: { total: memberTotal, toInvite: invites.length, alreadyMembers, alreadyInvited, skipped: memberSkipped },
      posts: { total: postTotal, toImport: posts.length, alreadyImported, skipped: postSkipped },
      spaces: { matched, toCreate },
      authors,
      warnings,
    },
  };
}

/** The candidate post ids a CSV would produce, so the server can look up which already exist before mapping. */
export function candidatePostIds(postsCsv: string, now: Date) {
  return mapCircleImport({ membersCsv: "", postsCsv }, { memberEmails: new Map(), pendingEmails: new Set(), spaces: [], importedPostIds: new Set() }, now).posts.map((post) => post.id);
}

export { spaceKey as circleSpaceKey };
