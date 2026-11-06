import { z } from "zod";

import { describeAnswer } from "./analysis";
import { blockTitle, type ResponseRecord, type StudyVersion } from "./model";

/**
 * Findings (pure). A finding is a researcher's claim and must cite evidence: a specific
 * participant answer (response + block) or a whole block's results. Evidence is resolved on
 * the server against the study's frozen versions and stored responses, never trusted as sent.
 */

export const FINDING_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];
export const FINDING_STATUSES = ["open", "in_progress", "resolved", "wont_fix"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const SEVERITY_LABELS: Record<FindingSeverity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  wont_fix: "Won't fix",
};

const ref = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const note = z.string().trim().max(500).default("");

export const evidenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("response"), responseId: ref, blockId: ref, note }),
  z.object({ kind: z.literal("block"), blockId: ref, note }),
]);
export type EvidenceInput = z.input<typeof evidenceSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;

export const findingInputSchema = z.object({
  title: z.string().trim().min(1, "Give the finding a title.").max(200),
  summary: z.string().trim().max(4000).default(""),
  severity: z.enum(FINDING_SEVERITIES).default("medium"),
  status: z.enum(FINDING_STATUSES).default("open"),
  evidence: z.array(evidenceSchema).min(1, "Every finding must cite at least one piece of evidence.").max(50),
});
export type FindingInput = z.input<typeof findingInputSchema>;

export type ResolvedEvidence = Evidence & { version: number; blockTitle: string; excerpt: string };

export type Finding = {
  id: string;
  studyId: string;
  title: string;
  summary: string;
  severity: FindingSeverity;
  status: FindingStatus;
  evidence: ResolvedEvidence[];
  createdBy: { uid: string; email: string };
  createdAt: string | null;
  updatedAt: string | null;
};

const MAX_EXCERPT = 500;

export function resolveEvidence(
  evidence: Evidence[],
  versions: StudyVersion[],
  responses: ResponseRecord[],
): { ok: true; evidence: ResolvedEvidence[] } | { ok: false; error: string; status: 404 | 422 } {
  const resolved: ResolvedEvidence[] = [];
  const seen = new Set<string>();
  const newestFirst = [...versions].sort((a, b) => b.version - a.version);
  for (const item of evidence) {
    const key = item.kind === "response" ? `r:${item.responseId}:${item.blockId}` : `b:${item.blockId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (item.kind === "block") {
      const version = newestFirst.find((candidate) => candidate.blocks.some((block) => block.id === item.blockId));
      const block = version?.blocks.find((candidate) => candidate.id === item.blockId);
      if (!version || !block) return { ok: false, error: "That block is not part of a published version of this study.", status: 404 };
      resolved.push({ ...item, version: version.version, blockTitle: blockTitle(block), excerpt: "" });
      continue;
    }
    const response = responses.find((candidate) => candidate.id === item.responseId);
    if (!response) return { ok: false, error: "That session is not part of this study.", status: 404 };
    const version = versions.find((candidate) => candidate.version === response.version);
    const block = version?.blocks.find((candidate) => candidate.id === item.blockId);
    if (!block || response.answers[item.blockId] === undefined) {
      return { ok: false, error: "That session did not answer the cited block.", status: 422 };
    }
    resolved.push({
      ...item,
      version: response.version,
      blockTitle: blockTitle(block),
      excerpt: describeAnswer(block, response.answers[item.blockId]).slice(0, MAX_EXCERPT),
    });
  }
  return { ok: true, evidence: resolved };
}

/** Evidence that points at a session a researcher has since excluded is called out, not hidden. */
export function excludedEvidence(finding: Pick<Finding, "evidence">, responses: Pick<ResponseRecord, "id" | "quality">[]) {
  const excluded = new Set(responses.filter((response) => response.quality?.decision === "excluded").map((response) => response.id));
  return finding.evidence.filter((item) => item.kind === "response" && excluded.has(item.responseId)).length;
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function sortFindings<T extends Pick<Finding, "severity" | "updatedAt">>(findings: T[]) {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
  );
}
