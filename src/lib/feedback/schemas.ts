import { z } from "zod";

import { POST_STATUSES } from "./model";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid id.");

export const createPostSchema = z.object({
  title: z.string().trim().min(4, "Give the idea a short title (4+ characters).").max(160),
  description: z.string().trim().max(5000).default(""),
});

export const commentSchema = z.object({
  content: z.string().trim().min(1, "Write a comment first.").max(5000),
});

export const createBoardSchema = z.object({
  name: z.string().trim().min(2, "Name the board.").max(80),
  slug: z.string().trim().max(60).optional(),
  description: z.string().trim().max(500).default(""),
  isPublic: z.boolean().default(true),
});

export const updateBoardSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(500).optional(),
  isPublic: z.boolean().optional(),
});

export const postActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), status: z.enum(POST_STATUSES), note: z.string().trim().max(2000).default("") }),
  z.object({ action: z.literal("merge"), canonicalId: id, note: z.string().trim().max(2000).default("") }),
  z.object({ action: z.literal("tags"), tagIds: z.array(id).max(20) }),
  z.object({
    action: z.literal("edit"),
    title: z.string().trim().min(4, "Titles need 4+ characters.").max(160),
    description: z.string().trim().max(5000).default(""),
  }),
  z.object({ action: z.literal("note"), content: z.string().trim().min(1, "Write the note first.").max(5000) }),
  z.object({ action: z.literal("moderate"), hidden: z.boolean(), reason: z.string().trim().max(500).default("") }),
]);

export const moderateCommentSchema = z.object({
  hidden: z.boolean(),
  reason: z.string().trim().max(500).default(""),
});

export const createTagSchema = z.object({
  name: z.string().trim().min(1, "Name the tag.").max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #27c7a6.").default("#27c7a6"),
  isPublic: z.boolean().default(true),
});

export const changelogSchema = z.object({
  title: z.string().trim().min(3, "Give the release a title.").max(140),
  body: z.string().trim().max(10000).default(""),
  postIds: z.array(id).max(50).default([]),
});

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  role: z.enum(["admin", "member", "viewer"]),
});

export const importSchema = z.object({
  csv: z.string().min(1, "Paste or choose a Canny CSV export.").max(2_000_000, "Split exports larger than 2 MB."),
  commit: z.boolean().default(false),
});
