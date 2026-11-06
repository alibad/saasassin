import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { FieldValue, type DocumentData, type DocumentSnapshot } from "firebase-admin/firestore";
import { z } from "zod";

import { buildExportManifest, toPortable } from "@/lib/fleet/platform/export";
import { FleetError, type FleetUser } from "@/lib/fleet/platform/session";
import {
  appendAuditEvent,
  db,
  listAuditEvents,
  listTenantMembers,
  PRIVILEGED_ROLES,
  requireTenantMember,
  tenantCollection,
  tenantRef,
  type FleetTenantRole,
} from "@/lib/fleet/platform/tenants";

import { aggregateResults, blockResponsesToCsv, buildStudyExport } from "./analysis";
import {
  excludedEvidence,
  findingInputSchema,
  resolveEvidence,
  sortFindings,
  type Finding,
  type FindingInput,
} from "./findings";
import { mapMazeCsv, MAZE_MAX_BYTES } from "./maze";
import {
  classifyDelivery,
  secretHint,
  SIGNATURE_HEADER,
  signatureHeader,
  validateWebhookUrl,
  WEBHOOK_EVENTS,
  type WebhookEvent,
} from "./webhooks";
import { assessSessions, isExcluded, type SessionQuality } from "./quality";
import {
  applyTransition,
  checkSubmission,
  closedReason,
  effectiveStatus,
  studyDraftSchema,
  studySettingsSchema,
  type ResponseRecord,
  type StudyDraft,
  type StudyRecord,
  type StudyTransition,
  type StudyVersion,
} from "./model";

export const SLUG = "studies";
export const EDITOR_ROLES: FleetTenantRole[] = [...PRIVILEGED_ROLES, "member"];

const studies = (tenantId: string) => tenantCollection(SLUG, tenantId, "studies");
const versions = (tenantId: string) => tenantCollection(SLUG, tenantId, "studyVersions");
const responses = (tenantId: string) => tenantCollection(SLUG, tenantId, "responses");
const findings = (tenantId: string) => tenantCollection(SLUG, tenantId, "findings");

const iso = (value: unknown) => (toPortable(value) as string | null) ?? null;

export function toStudy(doc: DocumentSnapshot<DocumentData>): StudyRecord {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    title: String(data.title ?? "Untitled study"),
    description: String(data.description ?? ""),
    status: data.status ?? "draft",
    draftBlocks: data.draftBlocks ?? [],
    settings: studySettingsSchema.parse(data.settings ?? {}),
    currentVersion: Number(data.currentVersion ?? 0),
    completedCount: Number(data.completedCount ?? 0),
    startedCount: Number(data.startedCount ?? 0),
    shareToken: data.shareToken ?? null,
    imported: data.imported
      ? {
          source: "maze",
          fileName: String(data.imported.fileName ?? ""),
          rows: Number(data.imported.rows ?? 0),
          importedResponses: Number(data.imported.importedResponses ?? 0),
          importedAt: iso(data.imported.importedAt),
        }
      : null,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

function toFinding(doc: DocumentSnapshot<DocumentData>): Finding {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    studyId: String(data.studyId),
    title: String(data.title ?? ""),
    summary: String(data.summary ?? ""),
    severity: data.severity ?? "medium",
    status: data.status ?? "open",
    evidence: Array.isArray(data.evidence) ? data.evidence : [],
    createdBy: { uid: String(data.createdBy?.uid ?? ""), email: String(data.createdBy?.email ?? "") },
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

function toVersion(doc: DocumentSnapshot<DocumentData>): StudyVersion {
  const data = doc.data() ?? {};
  return {
    studyId: String(data.studyId),
    version: Number(data.version),
    title: String(data.title ?? ""),
    blocks: data.blocks ?? [],
    settings: studySettingsSchema.parse(data.settings ?? {}),
    publishedAt: iso(data.publishedAt),
  };
}

function toResponse(doc: DocumentSnapshot<DocumentData>): ResponseRecord {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    studyId: String(data.studyId),
    version: Number(data.version),
    status: data.status,
    answers: data.answers ?? {},
    path: data.path ?? [],
    blockTimings: data.blockTimings ?? {},
    startedAt: iso(data.startedAt),
    submittedAt: iso(data.submittedAt),
    durationMs: typeof data.durationMs === "number" ? data.durationMs : null,
    quality: data.quality
      ? {
          decision: data.quality.decision === "excluded" ? "excluded" : "kept",
          reason: String(data.quality.reason ?? ""),
          decidedBy: { uid: String(data.quality.decidedBy?.uid ?? ""), email: String(data.quality.decidedBy?.email ?? "") },
          decidedAt: iso(data.quality.decidedAt),
        }
      : null,
    source: data.source === "maze" ? "maze" : "participant",
    ...(data.source === "maze" ? { externalId: typeof data.externalId === "string" ? data.externalId : null } : {}),
  };
}

const versionId = (studyId: string, version: number) => `${studyId}-v${version}`;

// ---------------------------------------------------------------------------
// Researcher operations (all require membership)
// ---------------------------------------------------------------------------

export async function listStudies(user: FleetUser, tenantId: string) {
  const { role } = await requireTenantMember(SLUG, tenantId, user);
  const snapshot = await studies(tenantId).orderBy("updatedAt", "desc").get();
  return { role, studies: snapshot.docs.map(toStudy) };
}

export async function getStudy(user: FleetUser, tenantId: string, studyId: string) {
  await requireTenantMember(SLUG, tenantId, user);
  const doc = await studies(tenantId).doc(studyId).get();
  if (!doc.exists) throw new FleetError("Study not found.", 404);
  return toStudy(doc);
}

export async function createStudy(user: FleetUser, tenantId: string, draft: StudyDraft) {
  await requireTenantMember(SLUG, tenantId, user, EDITOR_ROLES);
  const parsed = studyDraftSchema.parse(draft);
  const ref = studies(tenantId).doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    title: parsed.title,
    description: parsed.description,
    draftBlocks: parsed.blocks,
    settings: parsed.settings,
    status: "draft",
    currentVersion: 0,
    completedCount: 0,
    startedCount: 0,
    shareToken: null,
    createdBy: user.uid,
    createdAt: now,
    updatedAt: now,
  });
  await appendAuditEvent(SLUG, tenantId, user, "study.created", { type: "study", id: ref.id }, { title: parsed.title });
  return toStudy(await ref.get());
}

export async function updateStudyDraft(user: FleetUser, tenantId: string, studyId: string, draft: StudyDraft) {
  await requireTenantMember(SLUG, tenantId, user, EDITOR_ROLES);
  const parsed = studyDraftSchema.parse(draft);
  const ref = studies(tenantId).doc(studyId);
  const existing = await ref.get();
  if (!existing.exists) throw new FleetError("Study not found.", 404);
  const study = toStudy(existing);
  if (study.imported) throw new FleetError(IMPORTED_READ_ONLY, 409);
  if (study.status === "draft") {
    await ref.update({
      title: parsed.title,
      description: parsed.description,
      draftBlocks: parsed.blocks,
      settings: parsed.settings,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    // Published blocks are frozen; only the title and the cap/close-date can change after launch.
    await ref.update({ title: parsed.title, description: parsed.description, settings: parsed.settings, updatedAt: FieldValue.serverTimestamp() });
  }
  await appendAuditEvent(SLUG, tenantId, user, "study.updated", { type: "study", id: studyId }, { blocks: parsed.blocks.length, status: study.status });
  return toStudy(await ref.get());
}

export async function transitionStudy(user: FleetUser, tenantId: string, studyId: string, transition: StudyTransition) {
  await requireTenantMember(SLUG, tenantId, user, EDITOR_ROLES);
  const ref = studies(tenantId).doc(studyId);
  const result = await db().runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new FleetError("Study not found.", 404);
    const study = toStudy(doc);
    if (study.imported) throw new FleetError(IMPORTED_READ_ONLY, 409);
    const outcome = applyTransition(study.status, transition, study.draftBlocks);
    if (!outcome.ok) throw new FleetError(outcome.error, 409);
    const update: DocumentData = { status: outcome.to, updatedAt: FieldValue.serverTimestamp() };
    if (transition === "publish") {
      const version = study.currentVersion + 1;
      tx.create(versions(tenantId).doc(versionId(studyId, version)), {
        studyId,
        version,
        title: study.title,
        blocks: study.draftBlocks,
        settings: study.settings,
        publishedAt: FieldValue.serverTimestamp(),
        publishedBy: user.uid,
      });
      update.currentVersion = version;
    }
    tx.update(ref, update);
    return { from: study.status, to: outcome.to };
  });
  await appendAuditEvent(SLUG, tenantId, user, `study.${transition}`, { type: "study", id: studyId }, result);
  return toStudy(await ref.get());
}

const IMPORTED_READ_ONLY = "Imported studies are read-only. Duplicate it to run it again in Studies.";

const mazeImportSchema = z.object({
  csv: z.string().min(1, "Choose a Maze results CSV.").max(MAZE_MAX_BYTES, "The file is larger than 5 MB."),
  fileName: z.string().trim().max(200).default("maze-results.csv"),
  title: z.string().trim().min(1, "Give the imported study a title.").max(200),
  commit: z.boolean().default(false),
});
export type MazeImportInput = z.input<typeof mazeImportSchema>;

/**
 * Maze migration. `commit: false` only maps and returns the preview + mapping report; `commit: true`
 * writes a closed, read-only study with one frozen version and the mapped responses (no session tokens).
 */
export async function importMazeStudy(user: FleetUser, tenantId: string, raw: MazeImportInput) {
  await requireTenantMember(SLUG, tenantId, user, EDITOR_ROLES);
  const input = mazeImportSchema.parse(raw);
  const mapped = mapMazeCsv(input.csv);
  if (!mapped.ok) throw new FleetError(mapped.error, 422);
  const { blocks, responses: rows, report } = mapped.mapping;
  if (!input.commit) {
    return { committed: false as const, blocks, report, sample: rows.slice(0, 5) };
  }
  const ref = studies(tenantId).doc();
  const now = FieldValue.serverTimestamp();
  const completed = rows.filter((row) => row.status === "completed").length;
  const settings = studySettingsSchema.parse({});
  const first = db().batch();
  first.set(ref, {
    title: input.title,
    description: `Imported from Maze (${input.fileName}).`,
    draftBlocks: blocks,
    settings,
    status: "closed",
    currentVersion: 1,
    completedCount: completed,
    startedCount: rows.length,
    shareToken: null,
    imported: { source: "maze", fileName: input.fileName, rows: report.rows, importedResponses: rows.length, importedAt: now },
    createdBy: user.uid,
    createdAt: now,
    updatedAt: now,
  });
  first.create(versions(tenantId).doc(versionId(ref.id, 1)), {
    studyId: ref.id,
    version: 1,
    title: input.title,
    blocks,
    settings,
    publishedAt: now,
    publishedBy: user.uid,
  });
  await first.commit();
  for (let offset = 0; offset < rows.length; offset += 400) {
    const batch = db().batch();
    for (const row of rows.slice(offset, offset + 400)) {
      batch.set(responses(tenantId).doc(), {
        studyId: ref.id,
        version: 1,
        source: "maze",
        externalId: row.externalId,
        status: row.status,
        answers: row.answers,
        path: row.path,
        blockTimings: row.blockTimings,
        startedAt: row.startedAt ? new Date(row.startedAt) : null,
        submittedAt: row.submittedAt ? new Date(row.submittedAt) : null,
        durationMs: row.durationMs,
      });
    }
    await batch.commit();
  }
  await appendAuditEvent(SLUG, tenantId, user, "study.imported", { type: "study", id: ref.id }, {
    source: "maze",
    fileName: input.fileName,
    rows: report.rows,
    imported: rows.length,
    skipped: report.skipped.length,
    blocks: blocks.length,
  });
  return { committed: true as const, study: toStudy(await ref.get()), report };
}

export async function duplicateStudy(user: FleetUser, tenantId: string, studyId: string) {
  const source = await getStudy(user, tenantId, studyId);
  await requireTenantMember(SLUG, tenantId, user, EDITOR_ROLES);
  const blocks = source.currentVersion > 0 ? (await getVersion(tenantId, studyId, source.currentVersion)).blocks : source.draftBlocks;
  const copy = await createStudy(user, tenantId, {
    title: `${source.title} (copy)`.slice(0, 200),
    description: source.description,
    blocks,
    settings: { ...source.settings, closeAt: null },
  });
  await appendAuditEvent(SLUG, tenantId, user, "study.duplicated", { type: "study", id: copy.id }, { sourceStudyId: studyId });
  return copy;
}

export async function setResultsSharing(user: FleetUser, tenantId: string, studyId: string, enabled: boolean) {
  await requireTenantMember(SLUG, tenantId, user, PRIVILEGED_ROLES);
  const ref = studies(tenantId).doc(studyId);
  if (!(await ref.get()).exists) throw new FleetError("Study not found.", 404);
  const shareToken = enabled ? randomBytes(18).toString("base64url") : null;
  await ref.update({ shareToken, updatedAt: FieldValue.serverTimestamp() });
  await appendAuditEvent(SLUG, tenantId, user, enabled ? "study.results_shared" : "study.results_unshared", { type: "study", id: studyId });
  return toStudy(await ref.get());
}

async function getVersion(tenantId: string, studyId: string, version: number) {
  const doc = await versions(tenantId).doc(versionId(studyId, version)).get();
  if (!doc.exists) throw new FleetError("Study version not found.", 404);
  return toVersion(doc);
}

async function loadStudyData(tenantId: string, studyId: string) {
  const doc = await studies(tenantId).doc(studyId).get();
  if (!doc.exists) throw new FleetError("Study not found.", 404);
  const study = toStudy(doc);
  const [versionSnapshot, responseSnapshot, findingSnapshot] = await Promise.all([
    versions(tenantId).where("studyId", "==", studyId).get(),
    responses(tenantId).where("studyId", "==", studyId).get(),
    findings(tenantId).where("studyId", "==", studyId).get(),
  ]);
  const allVersions = versionSnapshot.docs.map(toVersion).sort((a, b) => a.version - b.version);
  const allResponses = responseSnapshot.docs.map(toResponse);
  return { study, versions: allVersions, responses: allResponses, findings: sortFindings(findingSnapshot.docs.map(toFinding)) };
}

// ---------------------------------------------------------------------------
// Findings (evidence-linked)
// ---------------------------------------------------------------------------

async function writeFinding(user: FleetUser, tenantId: string, studyId: string, raw: FindingInput, findingId?: string) {
  await requireTenantMember(SLUG, tenantId, user, EDITOR_ROLES);
  const input = findingInputSchema.parse(raw);
  const data = await loadStudyData(tenantId, studyId);
  const resolved = resolveEvidence(input.evidence, data.versions, data.responses);
  if (!resolved.ok) throw new FleetError(resolved.error, resolved.status);
  const record = { ...input, evidence: resolved.evidence, studyId, updatedAt: FieldValue.serverTimestamp() };
  if (findingId) {
    const ref = findings(tenantId).doc(findingId);
    const existing = await ref.get();
    if (!existing.exists || existing.get("studyId") !== studyId) throw new FleetError("Finding not found.", 404);
    await ref.update(record);
    await appendAuditEvent(SLUG, tenantId, user, "finding.updated", { type: "finding", id: findingId }, {
      studyId,
      from: existing.get("status"),
      to: input.status,
      evidence: resolved.evidence.length,
    });
    return toFinding(await ref.get());
  }
  const ref = findings(tenantId).doc();
  await ref.set({ ...record, createdBy: { uid: user.uid, email: user.email }, createdAt: FieldValue.serverTimestamp() });
  await appendAuditEvent(SLUG, tenantId, user, "finding.created", { type: "finding", id: ref.id }, {
    studyId,
    severity: input.severity,
    evidence: resolved.evidence.length,
  });
  return toFinding(await ref.get());
}

export const createFinding = (user: FleetUser, tenantId: string, studyId: string, input: FindingInput) => writeFinding(user, tenantId, studyId, input);
export const updateFinding = (user: FleetUser, tenantId: string, studyId: string, findingId: string, input: FindingInput) =>
  writeFinding(user, tenantId, studyId, input, findingId);

export async function deleteFinding(user: FleetUser, tenantId: string, studyId: string, findingId: string) {
  await requireTenantMember(SLUG, tenantId, user, EDITOR_ROLES);
  const ref = findings(tenantId).doc(findingId);
  const existing = await ref.get();
  if (!existing.exists || existing.get("studyId") !== studyId) throw new FleetError("Finding not found.", 404);
  await ref.delete();
  await appendAuditEvent(SLUG, tenantId, user, "finding.deleted", { type: "finding", id: findingId }, { studyId, title: existing.get("title") });
}

export type ResultsPayload = ReturnType<typeof buildResultsPayload>;
export type SessionSummary = ResultsPayload["sessions"][number];

/**
 * Aggregates the current published version; responses to older versions are counted, not mixed in.
 * Excluded sessions are left out of every number unless `includeExcluded` is set. `audience: "shared"`
 * (the public read-only link) never carries raw sessions.
 */
export function buildResultsPayload(
  data: { study: StudyRecord; versions: StudyVersion[]; responses: ResponseRecord[]; findings?: Finding[] },
  options: { includeExcluded?: boolean; audience?: "workspace" | "shared" } = {},
) {
  const { study, versions: allVersions, responses: allResponses } = data;
  const includeExcluded = Boolean(options.includeExcluded) && options.audience !== "shared";
  const version = allVersions.find((candidate) => candidate.version === study.currentVersion) ?? null;
  const current = allResponses.filter((response) => response.version === study.currentVersion);
  const { threshold, sessions } = assessSessions(allVersions, study.settings, allResponses, study.currentVersion);
  const counted = includeExcluded ? current : current.filter((response) => !isExcluded(response));
  const summaries = current
    .map((response) => ({
      id: response.id,
      status: response.status,
      source: response.source,
      startedAt: response.startedAt,
      submittedAt: response.submittedAt,
      durationMs: response.durationMs,
      path: response.path,
      answers: response.answers,
      ...(sessions.get(response.id) as SessionQuality),
    }))
    .sort((a, b) => String(b.startedAt ?? "").localeCompare(String(a.startedAt ?? "")));
  return {
    study: { ...study, shareToken: options.audience === "shared" ? null : study.shareToken },
    effectiveStatus: effectiveStatus(study),
    version,
    results: version ? aggregateResults(version.blocks, counted) : null,
    otherVersionResponses: allResponses.length - current.length,
    quality: {
      includeExcluded,
      excluded: current.filter(isExcluded).length,
      flagged: summaries.filter((session) => session.flags.length > 0).length,
      threshold,
    },
    sessions: options.audience === "shared" ? [] : summaries,
    findings: (data.findings ?? []).map((finding) => ({ ...finding, excludedEvidence: excludedEvidence(finding, allResponses) })),
  };
}

const exclusionSchema = z.object({
  excluded: z.boolean(),
  reason: z.string().trim().max(500).default(""),
});
export type ExclusionInput = z.input<typeof exclusionSchema>;

/** Exclude a session from results (a reason is required) or mark it reviewed and kept. Audited. */
export async function setResponseExclusion(user: FleetUser, tenantId: string, studyId: string, responseId: string, raw: ExclusionInput) {
  await requireTenantMember(SLUG, tenantId, user, EDITOR_ROLES);
  const input = exclusionSchema.parse(raw);
  if (input.excluded && input.reason.length < 3) throw new FleetError("Say why this session is excluded.", 400);
  const ref = responses(tenantId).doc(responseId);
  const doc = await ref.get();
  if (!doc.exists || doc.get("studyId") !== studyId) throw new FleetError("Session not found.", 404);
  const reason = input.reason || "Reviewed and kept.";
  await ref.update({
    quality: {
      decision: input.excluded ? "excluded" : "kept",
      reason,
      decidedBy: { uid: user.uid, email: user.email },
      decidedAt: FieldValue.serverTimestamp(),
    },
  });
  await appendAuditEvent(SLUG, tenantId, user, input.excluded ? "response.excluded" : "response.included", { type: "response", id: responseId }, {
    studyId,
    reason,
    previous: doc.get("quality.decision") ?? null,
  });
  return toResponse(await ref.get());
}

export async function getStudyResults(user: FleetUser, tenantId: string, studyId: string) {
  await requireTenantMember(SLUG, tenantId, user);
  return loadStudyData(tenantId, studyId);
}

/** Public, token-gated read-only results. Never reveals anything without a matching token. */
export async function getSharedResults(tenantId: string, studyId: string, token: string) {
  const doc = await studies(tenantId).doc(studyId).get();
  const shareToken = doc.exists ? doc.get("shareToken") : null;
  if (!shareToken || typeof token !== "string" || !safeEqual(shareToken, token)) {
    throw new FleetError("These results are not shared.", 404);
  }
  return loadStudyData(tenantId, studyId);
}

export async function exportWorkspace(user: FleetUser, tenantId: string) {
  await requireTenantMember(SLUG, tenantId, user);
  const [studySnapshot, versionSnapshot, responseSnapshot, findingSnapshot] = await Promise.all([
    studies(tenantId).get(),
    versions(tenantId).get(),
    responses(tenantId).get(),
    findings(tenantId).get(),
  ]);
  const [hookSnapshot, deliverySnapshot] = await Promise.all([webhooks(tenantId).get(), deliveries(tenantId).get()]);
  return {
    webhooks: hookSnapshot.docs.map((doc) => ({ ...toWebhook(doc), secret: "[redacted]" })),
    webhookDeliveries: deliverySnapshot.docs.map((doc) => ({ id: doc.id, ...(toPortable(doc.data()) as Record<string, unknown>) })),
    studies: studySnapshot.docs.map((doc) => {
      const study = toStudy(doc);
      return { ...study, shareToken: undefined, resultsShared: Boolean(study.shareToken) };
    }),
    versions: versionSnapshot.docs.map(toVersion),
    responses: responseSnapshot.docs.map(toResponse),
    findings: findingSnapshot.docs.map(toFinding),
  };
}

/** Study-level download: the versioned responses JSON, or one block of the published version as CSV. */
export async function exportStudy(
  user: FleetUser,
  tenantId: string,
  studyId: string,
  options: { format: "json" | "csv"; blockId?: string; includeExcluded?: boolean },
) {
  const { study, versions: allVersions, responses: allResponses, findings: studyFindings } = await getStudyResults(user, tenantId, studyId);
  const safeTitle = study.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "study";
  if (options.format === "csv") {
    const blockId = options.blockId ?? "";
    const version = allVersions.find((candidate) => candidate.version === study.currentVersion);
    const block = version?.blocks.find((candidate) => candidate.id === blockId);
    if (!version || !block) throw new FleetError("Block not found in the published version.", 404);
    const rows = allResponses
      .filter((response) => response.version === version.version)
      .filter((response) => options.includeExcluded || !isExcluded(response));
    const csv = blockResponsesToCsv(block, rows);
    await appendAuditEvent(SLUG, tenantId, user, "study.exported_csv", { type: "study", id: studyId }, {
      blockId,
      includeExcluded: Boolean(options.includeExcluded),
    });
    return { filename: `${safeTitle}-${blockId}.csv`, contentType: "text/csv; charset=utf-8", body: csv };
  }
  const { sessions } = assessSessions(allVersions, study.settings, allResponses, study.currentVersion);
  await appendAuditEvent(SLUG, tenantId, user, "study.exported_json", { type: "study", id: studyId }, { responses: allResponses.length });
  return {
    filename: `${safeTitle}-responses.json`,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(buildStudyExport(study, allVersions, allResponses, { quality: sessions, findings: studyFindings }), null, 2),
  };
}

/** The complete, versioned workspace bundle (every collection Studies owns, members and the audit log). */
export async function buildWorkspaceExport(user: FleetUser, tenantId: string) {
  const data = await exportWorkspace(user, tenantId);
  const [members, audit] = await Promise.all([listTenantMembers(SLUG, tenantId), listAuditEvents(SLUG, tenantId, 500)]);
  const files: Record<string, { schema: string; records: unknown[] }> = {
    "studies.json": { schema: "net.saasassin.studies.study@1", records: data.studies },
    "study-versions.json": { schema: "net.saasassin.studies.study-version@1", records: data.versions },
    "responses.json": { schema: "net.saasassin.studies.response@1", records: data.responses },
    "findings.json": { schema: "net.saasassin.studies.finding@1", records: data.findings },
    "webhooks.json": { schema: "net.saasassin.studies.webhook@1", records: data.webhooks },
    "webhook-deliveries.json": { schema: "net.saasassin.studies.webhook-delivery@1", records: data.webhookDeliveries },
    "members.json": { schema: "net.saasassin.fleet.membership@1", records: members },
    "audit-events.json": { schema: "net.saasassin.fleet.audit-event@1", records: audit },
  };
  const manifest = buildExportManifest(
    SLUG,
    tenantId,
    Object.entries(files).map(([path, file]) => ({ path, schema: file.schema, records: file.records.length })),
  );
  await appendAuditEvent(SLUG, tenantId, user, "workspace.exported", { type: "tenant", id: tenantId }, {
    studies: data.studies.length,
    responses: data.responses.length,
  });
  return {
    manifest,
    files: Object.fromEntries(Object.entries(files).map(([path, file]) => [path, toPortable(file.records)])) as Record<string, unknown[]>,
  };
}

// ---------------------------------------------------------------------------
// Participant operations (public; validated strictly server-side)
// ---------------------------------------------------------------------------

function safeEqual(a: string, b: string) {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return left.equals(right);
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function loadPublicStudy(tenantId: string, studyId: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(tenantId) || !/^[A-Za-z0-9_-]{1,128}$/.test(studyId)) {
    throw new FleetError("Study not found.", 404);
  }
  const tenant = await tenantRef(SLUG, tenantId).get();
  if (!tenant.exists) throw new FleetError("Study not found.", 404);
  const doc = await studies(tenantId).doc(studyId).get();
  if (!doc.exists) throw new FleetError("Study not found.", 404);
  const study = toStudy(doc);
  if (study.status === "draft" || study.currentVersion < 1 || study.imported) throw new FleetError("Study not found.", 404);
  return study;
}

export async function getPublicStudy(tenantId: string, studyId: string) {
  const study = await loadPublicStudy(tenantId, studyId);
  const version = await getVersion(tenantId, studyId, study.currentVersion);
  const reason = closedReason(study);
  return {
    studyId,
    tenantId,
    version: version.version,
    title: version.title,
    blocks: version.blocks,
    endMessage: version.settings.endMessage,
    open: reason === null,
    closedReason: reason,
  };
}

export async function startParticipantSession(tenantId: string, studyId: string) {
  const study = await loadPublicStudy(tenantId, studyId);
  const reason = closedReason(study);
  if (reason) throw new FleetError(reason, 410);
  const token = randomBytes(24).toString("base64url");
  const ref = responses(tenantId).doc();
  const batch = db().batch();
  batch.set(ref, {
    studyId,
    version: study.currentVersion,
    status: "in_progress",
    answers: {},
    path: [],
    blockTimings: {},
    tokenHash: hashToken(token),
    startedAt: FieldValue.serverTimestamp(),
    submittedAt: null,
    durationMs: null,
  });
  batch.update(studies(tenantId).doc(studyId), { startedCount: FieldValue.increment(1) });
  await batch.commit();
  return { sessionId: ref.id, token, version: study.currentVersion };
}

export async function recordParticipantProgress(
  tenantId: string,
  studyId: string,
  input: { sessionId: string; token: string; answers: Record<string, unknown>; blockTimings: Record<string, number>; final: boolean },
) {
  const study = await loadPublicStudy(tenantId, studyId);
  const responseRef = responses(tenantId).doc(input.sessionId);
  const outcome = await db().runTransaction(async (tx) => {
    const [responseDoc, studyDoc] = await Promise.all([tx.get(responseRef), tx.get(studies(tenantId).doc(studyId))]);
    if (!responseDoc.exists || responseDoc.get("studyId") !== studyId || !safeEqual(responseDoc.get("tokenHash"), hashToken(input.token))) {
      throw new FleetError("This session is not valid.", 403);
    }
    if (responseDoc.get("status") !== "in_progress") throw new FleetError("These responses were already submitted.", 409);
    const current = toStudy(studyDoc);
    if (current.status === "closed" || (input.final && effectiveStatus(current) !== "live")) {
      throw new FleetError(closedReason(current) ?? "This study is closed.", 410);
    }
    const version = Number(responseDoc.get("version"));
    const versionDoc = await tx.get(versions(tenantId).doc(versionId(studyId, version)));
    if (!versionDoc.exists) throw new FleetError("Study version not found.", 404);
    const frozen = toVersion(versionDoc);
    const check = checkSubmission(frozen.blocks, input.answers, input.final);
    if (!check.ok) throw new FleetError(check.error, 422);
    const timings = Object.fromEntries(
      Object.entries(input.blockTimings)
        .filter(([blockId, value]) => check.path.includes(blockId) && Number.isFinite(value) && value >= 0)
        .map(([blockId, value]) => [blockId, Math.min(Math.round(value), 1000 * 60 * 60 * 6)]),
    );
    const startedAt = responseDoc.get("startedAt")?.toDate?.() as Date | undefined;
    const finished = check.outcome !== "in_progress";
    const durationMs = finished && startedAt ? Date.now() - startedAt.getTime() : null;
    tx.update(responseRef, {
      answers: check.answers,
      path: check.path,
      blockTimings: timings,
      status: check.outcome,
      ...(finished ? { submittedAt: FieldValue.serverTimestamp(), durationMs } : {}),
    });
    const events: StudyEventMessage[] = [];
    if (check.outcome === "completed") {
      tx.update(studies(tenantId).doc(studyId), { completedCount: FieldValue.increment(1) });
      events.push({
        event: "response.completed",
        data: {
          studyId,
          studyTitle: current.title,
          version,
          responseId: input.sessionId,
          submittedAt: new Date().toISOString(),
          durationMs,
          path: check.path,
          answers: check.answers,
        },
      });
      const cap = current.settings.participantCap;
      if (cap !== null && current.completedCount + 1 >= cap) {
        events.push({ event: "study.closed", data: { studyId, studyTitle: current.title, reason: "participant_cap", completedCount: current.completedCount + 1 } });
      }
    }
    return { outcome: check.outcome, events };
  });
  void study;
  return { status: outcome.outcome, events: outcome.events };
}

// ---------------------------------------------------------------------------
// Signed outbound webhooks
// ---------------------------------------------------------------------------

export type StudyEventMessage = { event: WebhookEvent; data: Record<string, unknown> };
type Fetcher = (url: string, init: RequestInit) => Promise<{ status: number }>;

const webhooks = (tenantId: string) => tenantCollection(SLUG, tenantId, "webhooks");
const deliveries = (tenantId: string) => tenantCollection(SLUG, tenantId, "webhookDeliveries");

const webhookInputSchema = z.object({
  url: z.string().trim().min(1, "Enter the endpoint URL.").max(2000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Choose at least one event."),
});
export type WebhookInput = z.input<typeof webhookInputSchema>;

export type WebhookSummary = { id: string; url: string; events: WebhookEvent[]; active: boolean; secretHint: string; createdAt: string | null };

function toWebhook(doc: DocumentSnapshot<DocumentData>): WebhookSummary {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    url: String(data.url ?? ""),
    events: (Array.isArray(data.events) ? data.events : []).filter((event: string) => (WEBHOOK_EVENTS as readonly string[]).includes(event)),
    active: data.active !== false,
    secretHint: secretHint(String(data.secret ?? "")),
    createdAt: iso(data.createdAt),
  };
}

/** Creates an endpoint; the signing secret is returned exactly once. */
export async function createWebhook(user: FleetUser, tenantId: string, raw: WebhookInput) {
  await requireTenantMember(SLUG, tenantId, user, PRIVILEGED_ROLES);
  const input = webhookInputSchema.parse(raw);
  const check = validateWebhookUrl(input.url);
  if (!check.ok) throw new FleetError(check.reason, 400);
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const ref = webhooks(tenantId).doc();
  await ref.set({ url: check.url, events: [...new Set(input.events)], active: true, secret, createdBy: user.uid, createdAt: FieldValue.serverTimestamp() });
  await appendAuditEvent(SLUG, tenantId, user, "webhook.created", { type: "webhook", id: ref.id }, { url: check.url, events: input.events });
  return { webhook: toWebhook(await ref.get()), secret };
}

export async function setWebhookActive(user: FleetUser, tenantId: string, webhookId: string, active: boolean) {
  await requireTenantMember(SLUG, tenantId, user, PRIVILEGED_ROLES);
  const ref = webhooks(tenantId).doc(webhookId);
  if (!(await ref.get()).exists) throw new FleetError("Webhook not found.", 404);
  await ref.update({ active });
  await appendAuditEvent(SLUG, tenantId, user, active ? "webhook.enabled" : "webhook.disabled", { type: "webhook", id: webhookId });
  return toWebhook(await ref.get());
}

export async function deleteWebhook(user: FleetUser, tenantId: string, webhookId: string) {
  await requireTenantMember(SLUG, tenantId, user, PRIVILEGED_ROLES);
  const ref = webhooks(tenantId).doc(webhookId);
  const existing = await ref.get();
  if (!existing.exists) throw new FleetError("Webhook not found.", 404);
  await ref.delete();
  await appendAuditEvent(SLUG, tenantId, user, "webhook.deleted", { type: "webhook", id: webhookId }, { url: existing.get("url") });
}

export type WebhookDelivery = {
  id: string;
  webhookId: string;
  url: string;
  event: string;
  status: "delivered" | "failed";
  httpStatus: number | null;
  error: string | null;
  durationMs: number;
  attemptedAt: string | null;
};

export async function listWebhooks(user: FleetUser, tenantId: string) {
  await requireTenantMember(SLUG, tenantId, user, PRIVILEGED_ROLES);
  const [hooks, log] = await Promise.all([webhooks(tenantId).get(), deliveries(tenantId).orderBy("attemptedAt", "desc").limit(50).get()]);
  return {
    webhooks: hooks.docs.map(toWebhook),
    deliveries: log.docs.map((doc) => ({ id: doc.id, ...(toPortable(doc.data()) as Record<string, unknown>) })) as WebhookDelivery[],
  };
}

/**
 * Signs and sends one event to every active endpoint subscribed to it, logging each attempt honestly.
 * Never throws: a failing endpoint must not break a participant's submission or a study closing.
 */
export async function dispatchStudyEvent(
  tenantId: string,
  message: { event: WebhookEvent | "webhook.test"; data: Record<string, unknown> },
  options: { fetcher?: Fetcher; onlyWebhookId?: string } = {},
) {
  const fetcher = options.fetcher ?? fetch;
  try {
    const hooks = options.onlyWebhookId
      ? [await webhooks(tenantId).doc(options.onlyWebhookId).get()].filter((doc) => doc.exists)
      : (await webhooks(tenantId).where("active", "==", true).get()).docs.filter((doc) => (doc.get("events") ?? []).includes(message.event));
    return await Promise.all(
      hooks.map(async (doc) => {
        const eventId = `evt_${randomBytes(12).toString("hex")}`;
        const body = JSON.stringify({ id: eventId, type: message.event, product: SLUG, tenantId, createdAt: new Date().toISOString(), data: message.data });
        const timestamp = Math.floor(Date.now() / 1000);
        const started = Date.now();
        let result: { httpStatus?: number; error?: string };
        const recheck = validateWebhookUrl(String(doc.get("url")));
        if (!recheck.ok) {
          result = { error: recheck.reason };
        } else {
          try {
            const response = await fetcher(recheck.url, {
              method: "POST",
              redirect: "manual",
              signal: AbortSignal.timeout(5000),
              headers: {
                "Content-Type": "application/json",
                "User-Agent": "SaaSassin-Studies-Webhooks/1",
                [SIGNATURE_HEADER]: signatureHeader(String(doc.get("secret")), timestamp, body),
              },
              body,
            });
            result = { httpStatus: response.status };
          } catch (error) {
            result = { error: (error as Error).name === "TimeoutError" ? "Timed out after 5s." : `Network error: ${(error as Error).message}` };
          }
        }
        const outcome = classifyDelivery(result);
        await deliveries(tenantId).add({
          webhookId: doc.id,
          url: doc.get("url"),
          event: message.event,
          eventId,
          ...outcome,
          durationMs: Date.now() - started,
          attemptedAt: FieldValue.serverTimestamp(),
        });
        return { webhookId: doc.id, eventId, ...outcome };
      }),
    );
  } catch (error) {
    console.error("Studies webhook dispatch failed", error);
    return [];
  }
}

/** Sends a signed `webhook.test` event to one endpoint (active or not) so its owner can check the receiver. */
export async function sendTestWebhook(user: FleetUser, tenantId: string, webhookId: string, options: { fetcher?: Fetcher } = {}) {
  await requireTenantMember(SLUG, tenantId, user, PRIVILEGED_ROLES);
  if (!(await webhooks(tenantId).doc(webhookId).get()).exists) throw new FleetError("Webhook not found.", 404);
  const [result] = await dispatchStudyEvent(
    tenantId,
    { event: "webhook.test", data: { message: "Test delivery from SaaSassin Studies." } },
    { ...options, onlyWebhookId: webhookId },
  );
  await appendAuditEvent(SLUG, tenantId, user, "webhook.tested", { type: "webhook", id: webhookId }, { status: result?.status ?? "failed" });
  return result ?? { webhookId, status: "failed" as const, httpStatus: null, error: "Webhook not found." };
}

export function studyClosedEvent(study: StudyRecord, actor: FleetUser): StudyEventMessage {
  return {
    event: "study.closed",
    data: { studyId: study.id, studyTitle: study.title, reason: "closed_by_researcher", closedBy: actor.email, completedCount: study.completedCount },
  };
}
