import { z } from "zod";

import type { TranscriptSegment } from "./transcript";

export const RESEARCH_SLUG = "research";

export const CONSENT_STATUSES = ["granted", "pending", "withdrawn", "not_required"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];
export const CONSENT_LABELS: Record<ConsentStatus, string> = {
  granted: "Consent granted",
  pending: "Consent pending",
  withdrawn: "Consent withdrawn",
  not_required: "Consent not required",
};

export type ResearchRole = "owner" | "admin" | "member" | "viewer";
export const EDITOR_ROLES: ResearchRole[] = ["owner", "admin", "member"];
export const MANAGER_ROLES: ResearchRole[] = ["owner", "admin"];

export function canEdit(role: string) {
  return (EDITOR_ROLES as string[]).includes(role);
}
export function canManage(role: string) {
  return (MANAGER_ROLES as string[]).includes(role);
}

export type Project = {
  id: string;
  name: string;
  description: string;
  createdAt: string | null;
  createdBy: string;
};

export type Participant = { name: string; email: string; company: string };
export type Consent = { status: ConsentStatus; capturedOn: string; retentionUntil: string; notes: string };

export type Source = {
  id: string;
  projectId: string;
  title: string;
  kind: "interview";
  format: "vtt" | "srt" | "plain";
  fileName: string;
  participant: Participant;
  consent: Consent;
  segments: TranscriptSegment[];
  redactionCount: number;
  legalHold?: LegalHold | null;
  createdAt: string | null;
  createdBy: string;
  updatedAt: string | null;
};

export type LegalHold = { reason: string; placedBy: string; placedAt: string | null };

export type Highlight = {
  id: string;
  projectId: string;
  sourceId: string;
  segmentId: string;
  start: number;
  end: number;
  quote: string;
  tags: string[];
  note: string;
  stale: boolean;
  redacted: boolean;
  createdAt: string | null;
  createdBy: string;
};

export type Insight = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  highlightIds: string[];
  themeId: string | null;
  createdAt: string | null;
  createdBy: string;
  updatedAt: string | null;
};

export type Theme = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  createdAt: string | null;
};

export type ProjectSnapshot = {
  project: Project;
  sources: Source[];
  highlights: Highlight[];
  insights: Insight[];
  themes: Theme[];
};

// ---------- validation ----------

const isoDate = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use a YYYY-MM-DD date.")
  .default("");

export const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(40, "Tags are limited to 40 characters.")
  .transform((tag) => tag.toLowerCase().replace(/\s+/g, "-"));

export const projectInputSchema = z.object({
  name: z.string().trim().min(2, "Name the project.").max(80),
  description: z.string().trim().max(500).default(""),
});

export const participantSchema = z.object({
  name: z.string().trim().min(1, "Name the participant (a pseudonym is fine).").max(80),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid participant email.")]).default(""),
  company: z.string().trim().max(80).default(""),
});

export const consentSchema = z.object({
  status: z.enum(CONSENT_STATUSES),
  capturedOn: isoDate,
  retentionUntil: isoDate,
  notes: z.string().trim().max(500).default(""),
});

export const createSourceSchema = z.object({
  type: z.literal("source.create"),
  title: z.string().trim().min(2, "Title the interview.").max(120),
  fileName: z.string().trim().max(160).default(""),
  format: z.enum(["auto", "vtt", "srt", "plain"]).default("auto"),
  content: z.string().min(1, "Paste or upload a transcript.").max(400_000),
  participant: participantSchema,
  consent: consentSchema,
});

export const actionSchema = z.discriminatedUnion("type", [
  createSourceSchema,
  z.object({
    type: z.literal("source.updateMeta"),
    sourceId: z.string().min(1),
    title: z.string().trim().min(2).max(120),
    participant: participantSchema,
    consent: consentSchema,
  }),
  z.object({
    type: z.literal("segment.update"),
    sourceId: z.string().min(1),
    segmentId: z.string().min(1),
    text: z.string().trim().min(1, "A segment cannot be empty.").max(20_000),
    speaker: z.string().trim().min(1, "Name the speaker.").max(80),
  }),
  z.object({
    type: z.literal("speaker.rename"),
    sourceId: z.string().min(1),
    from: z.string().trim().min(1),
    to: z.string().trim().min(1, "Name the speaker.").max(80),
  }),
  z.object({
    type: z.literal("segment.redact"),
    sourceId: z.string().min(1),
    segmentId: z.string().min(1),
    start: z.number().int().min(0),
    end: z.number().int().min(1),
    reason: z.string().trim().min(2, "Give a reason for the redaction.").max(200),
  }),
  z.object({
    type: z.literal("source.hold"),
    sourceId: z.string().min(1),
    reason: z.string().trim().min(2, "Give a reason for the legal hold.").max(200),
  }),
  z.object({
    type: z.literal("source.release"),
    sourceId: z.string().min(1),
    reason: z.string().trim().min(2, "Give a reason for releasing the hold.").max(200),
  }),
  z.object({
    type: z.literal("source.delete"),
    sourceId: z.string().min(1),
    reason: z.string().trim().min(2, "Give a reason for the deletion.").max(200),
  }),
  z.object({
    type: z.literal("highlight.create"),
    sourceId: z.string().min(1),
    segmentId: z.string().min(1),
    start: z.number().int().min(0),
    end: z.number().int().min(1),
    tags: z.array(tagSchema).max(12).default([]),
    note: z.string().trim().max(1000).default(""),
  }),
  z.object({
    type: z.literal("highlight.update"),
    highlightId: z.string().min(1),
    tags: z.array(tagSchema).max(12),
    note: z.string().trim().max(1000).default(""),
  }),
  z.object({ type: z.literal("highlight.delete"), highlightId: z.string().min(1) }),
  z.object({
    type: z.literal("insight.create"),
    title: z.string().trim().min(3, "Write the insight headline.").max(160),
    body: z.string().trim().max(4000).default(""),
    highlightIds: z.array(z.string().min(1)).min(1, "Link at least one highlight as evidence.").max(50),
    themeId: z.string().min(1).nullable().default(null),
  }),
  z.object({
    type: z.literal("insight.update"),
    insightId: z.string().min(1),
    title: z.string().trim().min(3).max(160),
    body: z.string().trim().max(4000).default(""),
    highlightIds: z.array(z.string().min(1)).min(1, "Link at least one highlight as evidence.").max(50),
    themeId: z.string().min(1).nullable().default(null),
  }),
  z.object({ type: z.literal("insight.delete"), insightId: z.string().min(1) }),
  z.object({
    type: z.literal("theme.create"),
    name: z.string().trim().min(2, "Name the theme.").max(60),
    description: z.string().trim().max(300).default(""),
  }),
  z.object({ type: z.literal("theme.delete"), themeId: z.string().min(1) }),
  z.object({ type: z.literal("tag.rename"), from: tagSchema, to: tagSchema }),
  z.object({
    type: z.literal("dovetail.import"),
    format: z.enum(["csv", "json"]),
    content: z.string().min(1).max(2_000_000),
    preview: z.boolean().default(true),
  }),
]);

export type ResearchAction = z.infer<typeof actionSchema>;

// ---------- derived views ----------

export function tagFrequency(highlights: Pick<Highlight, "tags">[]) {
  const counts = new Map<string, number>();
  for (const highlight of highlights) {
    for (const tag of new Set(highlight.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function retentionState(consent: Pick<Consent, "retentionUntil">, today = new Date().toISOString().slice(0, 10)) {
  if (!consent.retentionUntil) return "none" as const;
  if (consent.retentionUntil < today) return "expired" as const;
  const days = (Date.parse(consent.retentionUntil) - Date.parse(today)) / 86_400_000;
  return days <= 30 ? ("soon" as const) : ("ok" as const);
}

// ---------- legal holds & retention enforcement ----------

export type RetentionCandidate = {
  id: string;
  projectId: string;
  title: string;
  consent: Pick<Consent, "retentionUntil" | "status">;
  legalHold?: LegalHold | null;
};

/**
 * Decides what an "apply retention" run deletes: sources whose retention date has passed, or whose consent
 * was withdrawn, unless a legal hold is active. Held sources are reported, never deleted.
 */
export function planRetention<T extends RetentionCandidate>(sources: T[], today = new Date().toISOString().slice(0, 10)) {
  const due = sources.filter(
    (source) => retentionState(source.consent, today) === "expired" || source.consent.status === "withdrawn",
  );
  const reasonFor = (source: T) => (source.consent.status === "withdrawn" ? "consent_withdrawn" : "retention_expired");
  return {
    toDelete: due.filter((source) => !source.legalHold).map((source) => ({ source, reason: reasonFor(source) })),
    held: due.filter((source) => Boolean(source.legalHold)).map((source) => ({ source, reason: reasonFor(source) })),
  };
}

/** What the browser sends; zod fills defaults server-side. */
export type ResearchActionInput = z.input<typeof actionSchema>;
