import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { FieldValue, type DocumentData, type DocumentSnapshot } from "firebase-admin/firestore";

import { toPortable } from "@/lib/fleet/platform/export";
import { FleetError, type FleetUser } from "@/lib/fleet/platform/session";
import {
  appendAuditEvent,
  db,
  PRIVILEGED_ROLES,
  requireTenantMember,
  tenantCollection,
  tenantRef,
  type FleetTenantRole,
} from "@/lib/fleet/platform/tenants";

import { aggregateResults } from "./analysis";
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
  const [versionSnapshot, responseSnapshot] = await Promise.all([
    versions(tenantId).where("studyId", "==", studyId).get(),
    responses(tenantId).where("studyId", "==", studyId).get(),
  ]);
  const allVersions = versionSnapshot.docs.map(toVersion).sort((a, b) => a.version - b.version);
  const allResponses = responseSnapshot.docs.map(toResponse);
  return { study, versions: allVersions, responses: allResponses };
}

export type ResultsPayload = ReturnType<typeof buildResultsPayload>;

/** Aggregates the current published version; responses to older versions are counted, not mixed in. */
export function buildResultsPayload(data: { study: StudyRecord; versions: StudyVersion[]; responses: ResponseRecord[] }) {
  const { study, versions: allVersions, responses: allResponses } = data;
  const version = allVersions.find((candidate) => candidate.version === study.currentVersion) ?? null;
  const current = allResponses.filter((response) => response.version === study.currentVersion);
  return {
    study: { ...study, shareToken: study.shareToken },
    effectiveStatus: effectiveStatus(study),
    version,
    results: version ? aggregateResults(version.blocks, current) : null,
    otherVersionResponses: allResponses.length - current.length,
  };
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
  const [studySnapshot, versionSnapshot, responseSnapshot] = await Promise.all([
    studies(tenantId).get(),
    versions(tenantId).get(),
    responses(tenantId).get(),
  ]);
  return {
    studies: studySnapshot.docs.map((doc) => {
      const study = toStudy(doc);
      return { ...study, shareToken: undefined, resultsShared: Boolean(study.shareToken) };
    }),
    versions: versionSnapshot.docs.map(toVersion),
    responses: responseSnapshot.docs.map(toResponse),
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
  if (study.status === "draft" || study.currentVersion < 1) throw new FleetError("Study not found.", 404);
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
    tx.update(responseRef, {
      answers: check.answers,
      path: check.path,
      blockTimings: timings,
      status: check.outcome,
      ...(finished
        ? { submittedAt: FieldValue.serverTimestamp(), durationMs: startedAt ? Date.now() - startedAt.getTime() : null }
        : {}),
    });
    if (check.outcome === "completed") tx.update(studies(tenantId).doc(studyId), { completedCount: FieldValue.increment(1) });
    return check.outcome;
  });
  void study;
  return { status: outcome };
}
