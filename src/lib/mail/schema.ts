import { z } from "zod";

import { SPLIT_KINDS, splitNeedsValue } from "./workflow";

export const MAIL_PRODUCT = "mail";
export const MAIL_WRITE_ROLES = ["owner", "admin", "member"];
export const MAIL_EXPORT_SCHEMA = "net.saasassin.mail.mailbox";
export const MAIL_EXPORT_VERSION = "1.0.0";

export const MAX_IMPORT_MESSAGES = 200;
export const MAX_RAW_MESSAGE_CHARS = 3_000_000;

export const importSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  messages: z
    .array(z.string().max(MAX_RAW_MESSAGE_CHARS, "One message is larger than 3 MB."))
    .min(1, "Choose at least one message.")
    .max(MAX_IMPORT_MESSAGES, `Import at most ${MAX_IMPORT_MESSAGES} messages per batch.`),
});

const isoInFuture = z.string().refine((value) => Number.isFinite(Date.parse(value)), "Pick a valid date.");

export const threadActionSchema = z.object({
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("archive") }),
    z.object({ type: z.literal("trash") }),
    z.object({ type: z.literal("restore") }),
    z.object({ type: z.literal("star"), value: z.boolean() }),
    z.object({ type: z.literal("read"), value: z.boolean() }),
    z.object({ type: z.literal("snooze"), until: isoInFuture }),
    z.object({ type: z.literal("unsnooze") }),
    z.object({ type: z.literal("label"), label: z.string().trim().min(1, "Name the label.").max(40), value: z.boolean() }),
    z.object({ type: z.literal("remind"), at: isoInFuture }),
    z.object({ type: z.literal("clear-reminder") }),
  ]),
});

const addressListText = z
  .string()
  .max(2000)
  .refine(
    (value) =>
      value
        .split(/[,;]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .every((entry) => /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/.test(entry)),
    "Check the recipient addresses.",
  );

export const draftSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/).optional(),
  threadId: z.string().regex(/^t_[0-9a-f]{16}$/).nullable().optional(),
  to: addressListText,
  cc: addressListText.optional().default(""),
  subject: z.string().max(300),
  body: z.string().max(100_000),
});

export const splitSchema = z
  .object({
    name: z.string().trim().min(1, "Name the split.").max(30),
    kind: z.enum(SPLIT_KINDS),
    value: z.string().trim().max(120).default(""),
  })
  .refine((split) => !splitNeedsValue(split.kind) || split.value.length > 0, { message: "This rule needs a value.", path: ["value"] });

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Name the snippet.").max(60),
  body: z.string().trim().min(1, "Write the snippet text.").max(10_000),
});

export const memberSchema = z.object({
  email: z.email("Enter a valid email."),
  role: z.enum(["admin", "member", "viewer"]),
});

export type DraftInput = z.infer<typeof draftSchema>;
