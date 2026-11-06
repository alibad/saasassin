import { describe, expect, it } from "vitest";

import {
  candidatePostIds,
  circleImportSchema,
  IMPORTED_SPACE_FALLBACK,
  inviteDocId,
  mapCircleImport,
  parseCsv,
  placeholderAuthorUid,
  stableHash,
  type ExistingCommunity,
} from "../src/lib/community/circle";

const now = new Date("2026-11-06T12:00:00.000Z");
const empty: ExistingCommunity = { memberEmails: new Map(), pendingEmails: new Set(), spaces: [], importedPostIds: new Set() };

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, embedded newlines, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n"multi\nline",\n\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["multi\nline", ""],
    ]);
    expect(parseCsv("")).toEqual([]);
  });
});

describe("Circle mapping", () => {
  it("maps members to pending invites with header aliases and a skip report", () => {
    const csv = "First name,Last name,Email Address,Tagline,Member since,Tags\nAda,Lovelace,ADA@x.io,Math,2024-01-02,a;b\n,,,,,\nGrace,H,grace@x.io,,,\nDup,,ada@x.io,,,\nOld,,old@x.io,,,\nKnown,,known@x.io,,,";
    const mapping = mapCircleImport({ membersCsv: csv, postsCsv: "" }, { ...empty, memberEmails: new Map([["known@x.io", "u-known"]]), pendingEmails: new Set(["old@x.io"]) }, now);
    expect(mapping.invites.map((invite) => [invite.email, invite.name])).toEqual([["ada@x.io", "Ada Lovelace"], ["grace@x.io", "Grace H"]]);
    expect(mapping.invites[0]).toMatchObject({ id: inviteDocId("ada@x.io"), headline: "Math", joinedCircleAt: "2024-01-02T00:00:00.000Z", tags: ["a", "b"] });
    expect(mapping.report.members).toMatchObject({ total: 5, toInvite: 2, alreadyMembers: 1, alreadyInvited: 1, skipped: [{ row: 4, reason: "Duplicate email in this file" }] });
  });

  it("warns when the members file has no email column", () => {
    const mapping = mapCircleImport({ membersCsv: "Name\nAda", postsCsv: "" }, empty, now);
    expect(mapping.report.warnings[0]).toMatch(/no Email column/);
    expect(mapping.invites).toEqual([]);
  });

  it("maps posts to spaces and authors, with deterministic ids for idempotent re-runs", () => {
    const postsCsv = [
      "Post Title,Content,Space Name,User Email,Author,Published At",
      "Hi,Hello,general,m@x.io,Member,2024-05-01T00:00:00Z",
      ',"Body only first line\nmore",,,,2024-05-02',
      "Anon,From nowhere,Wins,,,not a date",
      ",,General,,,",
    ].join("\n");
    const existing = { ...empty, memberEmails: new Map([["m@x.io", "u-m"]]), spaces: [{ id: "s-gen", name: "General" }] };
    const mapping = mapCircleImport({ membersCsv: "", postsCsv }, existing, now);
    expect(mapping.posts.map((post) => [post.title, post.spaceName, post.authorUid])).toEqual([
      ["Hi", "general", "u-m"],
      ["Body only first line", IMPORTED_SPACE_FALLBACK, "circle_unknown"],
      ["Anon", "Wins", "circle_unknown"],
    ]);
    expect(mapping.posts[2].createdAt).toBe(now.toISOString());
    expect(mapping.report.spaces).toEqual({ matched: [{ name: "General", spaceId: "s-gen" }], toCreate: [IMPORTED_SPACE_FALLBACK, "Wins"] });
    expect(mapping.report.posts.skipped).toEqual([{ row: 5, reason: "No title or body" }]);
    expect(mapping.report.warnings.join(" ")).toMatch(/1 post has no readable date/);
    expect(candidatePostIds(postsCsv, now)).toEqual(mapping.posts.map((post) => post.id));
    const rerun = mapCircleImport({ membersCsv: "", postsCsv }, { ...existing, importedPostIds: new Set(mapping.posts.map((post) => post.id)) }, now);
    expect(rerun.report.posts).toMatchObject({ toImport: 0, alreadyImported: 3 });
  });

  it("gives not-yet-joined authors a placeholder that never contains their email", () => {
    const mapping = mapCircleImport({ membersCsv: "Name,Email\nZed,zed@x.io", postsCsv: "Title,Body,Author Email\nA,B,ZED@x.io" }, empty, now);
    expect(mapping.posts[0]).toMatchObject({ authorUid: placeholderAuthorUid("zed@x.io"), authorName: "Zed" });
    expect(mapping.posts[0].authorUid).not.toContain("zed");
    expect(stableHash("abc")).toMatch(/^[0-9a-f]{16}$/);
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
  });

  it("caps import size and validates input", () => {
    expect(circleImportSchema.parse({})).toEqual({ membersCsv: "", postsCsv: "", commit: false });
    expect(() => circleImportSchema.parse({ membersCsv: "x".repeat(2_000_001) })).toThrow(/2 MB/);
  });
});
