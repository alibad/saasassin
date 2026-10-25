import { z } from "zod";

import { DEAL_STAGES } from "./deals";

export const REVENUE_SLUG = "revenue";

/** Product roles. owner/admin are the shared privileged roles. */
export const REVENUE_ROLES = ["owner", "admin", "manager", "rep", "viewer"] as const;
export type RevenueRole = (typeof REVENUE_ROLES)[number];
export const INVITABLE_ROLES = ["admin", "manager", "rep", "viewer"] as const;

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  rep: "Rep",
  member: "Rep",
  viewer: "Viewer",
};

/** Who may write each kind of record. "member" is accepted as a legacy alias of rep. */
export const WRITE_ROLES = ["owner", "admin", "manager", "rep", "member"];
export const COACH_ROLES = ["owner", "admin", "manager"];
export const ADMIN_ROLES = ["owner", "admin"];

export function canWrite(role: string) {
  return WRITE_ROLES.includes(role);
}
export function canCoach(role: string) {
  return COACH_ROLES.includes(role);
}
export function isAdmin(role: string) {
  return ADMIN_ROLES.includes(role);
}

export const CONSENT_BASES = ["all-party-verbal", "all-party-written", "all-party-notice-and-continue"] as const;
export const CONSENT_BASIS_LABELS: Record<(typeof CONSENT_BASES)[number], string> = {
  "all-party-verbal": "Every participant agreed verbally on the recording",
  "all-party-written": "Every participant agreed in writing before the call",
  "all-party-notice-and-continue": "Every participant was notified and chose to continue",
};

export const consentSchema = z.object({
  jurisdiction: z.string().trim().min(2, "Record the jurisdiction the call took place in.").max(80),
  basis: z.enum(CONSENT_BASES, { message: "Choose how consent was obtained." }),
  allPartyConfirmed: z.literal(true, { message: "Confirm every participant consented to the recording." }),
  notes: z.string().trim().max(500).default(""),
});

export const accountSchema = z.object({
  name: z.string().trim().min(2, "Name the account.").max(120),
  domain: z.string().trim().max(120).default(""),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

export const dealSchema = z.object({
  name: z.string().trim().min(2, "Name the deal.").max(120),
  accountId: z.string().min(1, "Choose an account."),
  stage: z.enum(DEAL_STAGES).default("prospecting"),
  amount: z.number({ message: "Enter an amount." }).nonnegative().max(1_000_000_000),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  closeDate: isoDate.nullable(),
  ownerEmail: z.string().trim().email("Choose a deal owner."),
});

export const dealUpdateSchema = z.object({
  stage: z.enum(DEAL_STAGES).optional(),
  amount: z.number().nonnegative().max(1_000_000_000).optional(),
  closeDate: isoDate.nullable().optional(),
  ownerEmail: z.string().trim().email().optional(),
});

export const callSchema = z.object({
  dealId: z.string().min(1, "Choose the deal this call belongs to."),
  title: z.string().trim().min(2, "Title the call.").max(160),
  occurredAt: z.string().datetime({ offset: true, message: "Enter when the call happened." }),
  repEmail: z.string().trim().email("Choose the rep on the call."),
  repSpeaker: z.string().trim().max(60).nullable(),
  format: z.enum(["auto", "vtt", "srt", "plain"]).default("auto"),
  transcript: z.string().min(1, "Paste or upload a transcript.").max(400_000),
  consent: consentSchema,
});

export const commentSchema = z.object({
  at: z.number().min(0).max(24 * 3600),
  segmentIndex: z.number().int().min(0).nullable(),
  body: z.string().trim().min(1, "Write a comment.").max(2000),
});

export const trackerSchema = z.object({
  name: z.string().trim().min(2, "Name the tracker.").max(60),
  kind: z.enum(["keyword", "competitor"]),
  keywords: z.array(z.string().trim().min(1).max(60)).min(1, "Add at least one keyword.").max(40),
});

export const scorecardSchema = z.object({
  scores: z.record(z.string(), z.number().int().min(1).max(5)),
  notes: z.string().trim().max(2000).default(""),
});

export const redactionSchema = z.object({
  segmentIndex: z.number().int().min(0),
  charStart: z.number().int().min(0),
  charEnd: z.number().int().min(1),
  reason: z.enum(["pii", "confidential", "off-topic", "other"]),
});

export const settingsSchema = z.object({
  staleAfterDays: z.number().int().min(1).max(365).optional(),
  /** null keeps transcripts indefinitely. */
  retentionDays: z.number().int().min(7, "Retention must be at least 7 days.").max(3650).nullable().optional(),
});

export const deleteCallSchema = z.object({
  reason: z.string().trim().min(3, "Say why the call is being deleted.").max(300),
});

export const memberSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  role: z.enum(INVITABLE_ROLES),
});

export const snippetSchema = z.object({
  title: z.string().trim().min(2, "Title the clip.").max(120),
  startSegment: z.number().int().min(0),
  endSegment: z.number().int().min(0),
  playlist: z.string().trim().min(2, "Name a playlist.").max(60),
  note: z.string().trim().max(1000).default(""),
});
