import "server-only";

import { parse as parseCsv } from "csv-parse/sync";
import { FieldValue, type DocumentData, type DocumentReference, type DocumentSnapshot, type WriteBatch } from "firebase-admin/firestore";

import { toPortable } from "@/lib/fleet/platform/export";
import { FleetError, type FleetUser } from "@/lib/fleet/platform/session";
import { appendAuditEvent, db, requireTenantMember, tenantCollection } from "@/lib/fleet/platform/tenants";

import { mapDovetailRows, rowsFromDovetailJson, type DovetailRow } from "./dovetail";
import {
  canEdit,
  canManage,
  RESEARCH_SLUG,
  retentionState,
  type Highlight,
  type Insight,
  type Project,
  type ProjectSnapshot,
  type ResearchAction,
  type ResearchRole,
  type Source,
  type Theme,
} from "./model";
import { adjustSpanForRedaction, reanchorSpan, redactText, validateHighlightSpan } from "./spans";
import { parseTranscript } from "./transcript";

const SLUG = RESEARCH_SLUG;
const DOC_BYTE_BUDGET = 900_000;
const MAX_IMPORT_ROWS = 2_000;

/**
 * Firestore batches cap at 500 writes. This writer commits every 400 operations so large sources and tags
 * can be deleted or renamed. Writes are ordered so a partial failure leaves the parent record in place to retry.
 */
class ChunkedWriter {
  private batch: WriteBatch = db().batch();
  private ops = 0;
  private pending: Promise<unknown>[] = [];

  private bump() {
    this.ops += 1;
    if (this.ops >= 400) {
      this.pending.push(this.batch.commit());
      this.batch = db().batch();
      this.ops = 0;
    }
  }
  set(ref: DocumentReference, data: DocumentData) {
    this.batch.set(ref, data);
    this.bump();
  }
  update(ref: DocumentReference, data: DocumentData) {
    this.batch.update(ref, data);
    this.bump();
  }
  delete(ref: DocumentReference) {
    this.batch.delete(ref);
    this.bump();
  }
  async commit() {
    await Promise.all(this.pending);
    if (this.ops > 0) await this.batch.commit();
    this.pending = [];
    this.batch = db().batch();
    this.ops = 0;
  }
}

const writer = () => new ChunkedWriter();

const col = (tenantId: string, name: "projects" | "sources" | "highlights" | "insights" | "themes") =>
  tenantCollection(SLUG, tenantId, name);

function fromDoc<T>(doc: DocumentSnapshot): T {
  return { id: doc.id, ...(toPortable(doc.data()) as object) } as T;
}

/** Membership gate for every research request. Returns the caller's verified role. */
export async function requireResearchMember(tenantId: string, user: FleetUser, need: "read" | "edit" | "manage" = "read") {
  const { tenant, role } = await requireTenantMember(SLUG, tenantId, user);
  if (need === "edit" && !canEdit(role)) throw new FleetError("Viewers can read this workspace but cannot change it.", 403);
  if (need === "manage" && !canManage(role)) throw new FleetError("Only workspace owners and admins can do that.", 403);
  return { tenant, role: role as ResearchRole };
}

export async function listProjects(tenantId: string): Promise<Project[]> {
  const snapshot = await col(tenantId, "projects").get();
  return snapshot.docs
    .map((doc) => fromDoc<Project>(doc))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function createProject(tenantId: string, user: FleetUser, input: { name: string; description: string }) {
  const ref = col(tenantId, "projects").doc();
  await ref.set({ name: input.name, description: input.description, createdBy: user.uid, createdAt: FieldValue.serverTimestamp() });
  await appendAuditEvent(SLUG, tenantId, user, "project.created", { type: "project", id: ref.id }, { name: input.name });
  return { id: ref.id, name: input.name };
}

async function requireProject(tenantId: string, projectId: string): Promise<Project> {
  const doc = await col(tenantId, "projects").doc(projectId).get();
  if (!doc.exists) throw new FleetError("Project not found.", 404);
  return fromDoc<Project>(doc);
}

async function byProject<T>(tenantId: string, name: "sources" | "highlights" | "insights" | "themes", projectId: string) {
  // Single-field equality only: no composite index needed. Sorting happens in memory.
  const snapshot = await col(tenantId, name).where("projectId", "==", projectId).get();
  return snapshot.docs.map((doc) => fromDoc<T>(doc));
}

export async function loadProjectSnapshot(tenantId: string, projectId: string): Promise<ProjectSnapshot> {
  const project = await requireProject(tenantId, projectId);
  const [sources, highlights, insights, themes] = await Promise.all([
    byProject<Source & { originalText?: string }>(tenantId, "sources", projectId),
    byProject<Highlight>(tenantId, "highlights", projectId),
    byProject<Insight>(tenantId, "insights", projectId),
    byProject<Theme>(tenantId, "themes", projectId),
  ]);
  const byCreated = (a: { createdAt: string | null }, b: { createdAt: string | null }) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  return {
    project,
    sources: sources.map((source) => {
      const { originalText: _omit, ...rest } = source;
      void _omit;
      return rest;
    }).sort(byCreated),
    highlights: highlights.sort(byCreated),
    insights: insights.sort(byCreated).reverse(),
    themes: themes.sort(byCreated),
  };
}

/** Every interview in the workspace that needs a retention or consent decision, most urgent first. */
export async function listRetentionQueue(tenantId: string) {
  const [sources, projects] = await Promise.all([
    col(tenantId, "sources").select("projectId", "title", "consent", "participant").get(),
    listProjects(tenantId),
  ]);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const rank = { expired: 0, withdrawn: 1, soon: 2, pending: 3 } as const;
  return sources.docs
    .map((doc) => {
      const consent = doc.get("consent") as Source["consent"];
      const state = retentionState(consent);
      const reason: keyof typeof rank | null =
        state === "expired" ? "expired" : consent.status === "withdrawn" ? "withdrawn" : state === "soon" ? "soon" : consent.status === "pending" ? "pending" : null;
      return reason
        ? {
            sourceId: doc.id,
            projectId: String(doc.get("projectId")),
            projectName: projectNames.get(String(doc.get("projectId"))) ?? "Unknown project",
            title: String(doc.get("title")),
            participant: String((doc.get("participant") as Source["participant"] | undefined)?.name ?? ""),
            consentStatus: consent.status,
            retentionUntil: consent.retentionUntil,
            reason,
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => rank[a.reason] - rank[b.reason] || a.retentionUntil.localeCompare(b.retentionUntil));
}

/** Loads sources including their stored original upload text (export only). */
export async function loadSourcesWithOriginals(tenantId: string, projectId: string) {
  return byProject<Source & { originalText?: string | null }>(tenantId, "sources", projectId);
}

async function loadSource(tenantId: string, projectId: string, sourceId: string) {
  const ref = col(tenantId, "sources").doc(sourceId);
  const doc = await ref.get();
  if (!doc.exists || doc.get("projectId") !== projectId) throw new FleetError("Source not found.", 404);
  return { ref, source: fromDoc<Source>(doc) };
}

async function loadHighlight(tenantId: string, projectId: string, highlightId: string) {
  const ref = col(tenantId, "highlights").doc(highlightId);
  const doc = await ref.get();
  if (!doc.exists || doc.get("projectId") !== projectId) throw new FleetError("Highlight not found.", 404);
  return { ref, highlight: fromDoc<Highlight>(doc) };
}

async function highlightsForSource(tenantId: string, projectId: string, sourceId: string) {
  const snapshot = await col(tenantId, "highlights").where("sourceId", "==", sourceId).get();
  return snapshot.docs.filter((doc) => doc.get("projectId") === projectId);
}

async function removeHighlightsFromInsights(batch: ChunkedWriter, tenantId: string, projectId: string, highlightIds: string[]) {
  if (highlightIds.length === 0) return 0;
  const ids = new Set(highlightIds);
  const insights = await col(tenantId, "insights").where("projectId", "==", projectId).get();
  let affected = 0;
  for (const doc of insights.docs) {
    const linked = (doc.get("highlightIds") as string[] | undefined) ?? [];
    if (linked.some((id) => ids.has(id))) {
      affected += 1;
      batch.update(doc.ref, { highlightIds: linked.filter((id) => !ids.has(id)), updatedAt: FieldValue.serverTimestamp() });
    }
  }
  return affected;
}

type ActionResult = Record<string, unknown>;

export async function applyResearchAction(
  tenantId: string,
  projectId: string,
  user: FleetUser,
  role: ResearchRole,
  action: ResearchAction,
): Promise<ActionResult> {
  if (!canEdit(role)) throw new FleetError("Viewers can read this workspace but cannot change it.", 403);
  await requireProject(tenantId, projectId);
  const now = FieldValue.serverTimestamp();
  const audit = (verb: string, target: { type: string; id: string }, details: Record<string, unknown> = {}) =>
    appendAuditEvent(SLUG, tenantId, user, verb, target, { projectId, ...details });

  switch (action.type) {
    case "source.create": {
      let parsed;
      try {
        parsed = parseTranscript(action.content, action.format);
      } catch (error) {
        throw new FleetError(error instanceof Error ? error.message : "The transcript could not be read.", 400);
      }
      if (parsed.segments.length === 0) throw new FleetError("No transcript text was found in that file.", 400);
      // Firestore documents are capped at 1 MiB of UTF-8; non-Latin transcripts use 2–3 bytes per character.
      const segmentBytes = Buffer.byteLength(JSON.stringify(parsed.segments), "utf8");
      if (segmentBytes > DOC_BYTE_BUDGET) {
        throw new FleetError("That transcript is too large for one interview. Split it into parts and add each one.", 400);
      }
      const keepOriginal = segmentBytes + Buffer.byteLength(action.content, "utf8") <= DOC_BYTE_BUDGET;
      const ref = col(tenantId, "sources").doc();
      await ref.set({
        projectId,
        title: action.title,
        kind: "interview",
        format: parsed.format,
        fileName: action.fileName,
        participant: action.participant,
        consent: action.consent,
        segments: parsed.segments,
        originalText: keepOriginal ? action.content : null,
        redactionCount: 0,
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      });
      await audit("source.created", { type: "source", id: ref.id }, {
        title: action.title,
        format: parsed.format,
        segments: parsed.segments.length,
        consent: action.consent.status,
        retentionUntil: action.consent.retentionUntil,
      });
      return { sourceId: ref.id, segments: parsed.segments.length, warnings: parsed.warnings };
    }

    case "source.updateMeta": {
      const { ref, source } = await loadSource(tenantId, projectId, action.sourceId);
      await ref.update({ title: action.title, participant: action.participant, consent: action.consent, updatedAt: now });
      await audit("source.metadata_updated", { type: "source", id: ref.id }, {
        consentFrom: source.consent.status,
        consentTo: action.consent.status,
        retentionUntil: action.consent.retentionUntil,
      });
      return { sourceId: ref.id };
    }

    case "segment.update": {
      const { ref, source } = await loadSource(tenantId, projectId, action.sourceId);
      const index = source.segments.findIndex((segment) => segment.id === action.segmentId);
      if (index === -1) throw new FleetError("Segment not found.", 404);
      const segments = source.segments.map((segment, i) => (i === index ? { ...segment, text: action.text, speaker: action.speaker } : segment));
      const batch = writer();
      batch.update(ref, { segments, updatedAt: now });
      let stale = 0;
      for (const doc of await highlightsForSource(tenantId, projectId, source.id)) {
        if (doc.get("segmentId") !== action.segmentId) continue;
        const next = reanchorSpan(action.text, { start: doc.get("start"), end: doc.get("end"), quote: doc.get("quote") });
        if (next.stale) stale += 1;
        batch.update(doc.ref, { start: next.start, end: next.end, stale: next.stale });
      }
      await batch.commit();
      await audit("segment.corrected", { type: "source", id: source.id }, {
        segmentId: action.segmentId,
        speakerChanged: source.segments[index].speaker !== action.speaker,
        staleHighlights: stale,
      });
      return { staleHighlights: stale };
    }

    case "speaker.rename": {
      const { ref, source } = await loadSource(tenantId, projectId, action.sourceId);
      let changed = 0;
      const segments = source.segments.map((segment) => {
        if (segment.speaker !== action.from) return segment;
        changed += 1;
        return { ...segment, speaker: action.to };
      });
      if (changed === 0) throw new FleetError("No segments use that speaker name.", 404);
      await ref.update({ segments, updatedAt: now });
      await audit("speaker.renamed", { type: "source", id: source.id }, { from: action.from, to: action.to, segments: changed });
      return { changed };
    }

    case "segment.redact": {
      const { ref, source } = await loadSource(tenantId, projectId, action.sourceId);
      const index = source.segments.findIndex((segment) => segment.id === action.segmentId);
      if (index === -1) throw new FleetError("Segment not found.", 404);
      const segment = source.segments[index];
      const valid = validateHighlightSpan(segment.text, action.start, action.end);
      if (!valid.ok) throw new FleetError(valid.error, 400);
      const result = redactText(segment.text, action.start, action.end);
      const segments = source.segments.map((entry, i) => (i === index ? { ...entry, text: result.text } : entry));
      const batch = writer();
      // The uploaded original still contains the redacted words, so it is dropped with the redaction.
      batch.update(ref, { segments, originalText: null, redactionCount: FieldValue.increment(1), updatedAt: now });
      let touched = 0;
      for (const doc of await highlightsForSource(tenantId, projectId, source.id)) {
        if (doc.get("segmentId") !== action.segmentId) continue;
        const next = adjustSpanForRedaction(result.text, { start: doc.get("start"), end: doc.get("end"), quote: doc.get("quote") }, action.start, action.end);
        if (next.redacted) touched += 1;
        batch.update(doc.ref, { start: next.start, end: next.end, quote: next.quote, redacted: next.redacted || doc.get("redacted") === true });
      }
      await batch.commit();
      await audit("segment.redacted", { type: "source", id: source.id }, {
        segmentId: action.segmentId,
        start: action.start,
        end: action.end,
        removedCharacters: result.removedLength,
        reason: action.reason,
        highlightsRewritten: touched,
      });
      return { highlightsRewritten: touched };
    }

    case "source.delete": {
      if (!canManage(role)) throw new FleetError("Only workspace owners and admins can delete sources.", 403);
      const { ref, source } = await loadSource(tenantId, projectId, action.sourceId);
      const highlightDocs = await highlightsForSource(tenantId, projectId, source.id);
      const batch = writer();
      const affected = await removeHighlightsFromInsights(batch, tenantId, projectId, highlightDocs.map((doc) => doc.id));
      highlightDocs.forEach((doc) => batch.delete(doc.ref));
      batch.delete(ref);
      await batch.commit();
      await audit("source.deleted", { type: "source", id: source.id }, {
        title: source.title,
        reason: action.reason,
        retentionUntil: source.consent.retentionUntil,
        consent: source.consent.status,
        highlightsRemoved: highlightDocs.length,
        insightsAffected: affected,
      });
      return { highlightsRemoved: highlightDocs.length, insightsAffected: affected };
    }

    case "highlight.create": {
      const { source } = await loadSource(tenantId, projectId, action.sourceId);
      const segment = source.segments.find((entry) => entry.id === action.segmentId);
      if (!segment) throw new FleetError("Segment not found.", 404);
      const valid = validateHighlightSpan(segment.text, action.start, action.end);
      if (!valid.ok) throw new FleetError(valid.error, 400);
      const ref = col(tenantId, "highlights").doc();
      await ref.set({
        projectId,
        sourceId: source.id,
        segmentId: segment.id,
        start: action.start,
        end: action.end,
        quote: valid.quote,
        tags: [...new Set(action.tags)],
        note: action.note,
        stale: false,
        redacted: false,
        createdBy: user.uid,
        createdAt: now,
      });
      await audit("highlight.created", { type: "highlight", id: ref.id }, { sourceId: source.id, segmentId: segment.id, tags: action.tags });
      return { highlightId: ref.id };
    }

    case "highlight.update": {
      const { ref } = await loadHighlight(tenantId, projectId, action.highlightId);
      await ref.update({ tags: [...new Set(action.tags)], note: action.note });
      await audit("highlight.updated", { type: "highlight", id: ref.id }, { tags: action.tags });
      return { highlightId: ref.id };
    }

    case "highlight.delete": {
      const { ref } = await loadHighlight(tenantId, projectId, action.highlightId);
      const batch = writer();
      const affected = await removeHighlightsFromInsights(batch, tenantId, projectId, [ref.id]);
      batch.delete(ref);
      await batch.commit();
      await audit("highlight.deleted", { type: "highlight", id: ref.id }, { insightsAffected: affected });
      return { insightsAffected: affected };
    }

    case "insight.create":
    case "insight.update": {
      const highlights = await byProject<Highlight>(tenantId, "highlights", projectId);
      const known = new Set(highlights.map((highlight) => highlight.id));
      const missing = action.highlightIds.filter((id) => !known.has(id));
      if (missing.length > 0) throw new FleetError("An evidence highlight no longer exists. Refresh and try again.", 400);
      if (action.themeId) {
        const theme = await col(tenantId, "themes").doc(action.themeId).get();
        if (!theme.exists || theme.get("projectId") !== projectId) throw new FleetError("Theme not found.", 404);
      }
      const fields = {
        title: action.title,
        body: action.body,
        highlightIds: [...new Set(action.highlightIds)],
        themeId: action.themeId,
        updatedAt: now,
      };
      if (action.type === "insight.create") {
        const ref = col(tenantId, "insights").doc();
        await ref.set({ ...fields, projectId, createdBy: user.uid, createdAt: now });
        await audit("insight.created", { type: "insight", id: ref.id }, { evidence: fields.highlightIds.length, themeId: action.themeId });
        return { insightId: ref.id };
      }
      const ref = col(tenantId, "insights").doc(action.insightId);
      const existing = await ref.get();
      if (!existing.exists || existing.get("projectId") !== projectId) throw new FleetError("Insight not found.", 404);
      await ref.update(fields);
      await audit("insight.updated", { type: "insight", id: ref.id }, { evidence: fields.highlightIds.length, themeId: action.themeId });
      return { insightId: ref.id };
    }

    case "insight.delete": {
      const ref = col(tenantId, "insights").doc(action.insightId);
      const existing = await ref.get();
      if (!existing.exists || existing.get("projectId") !== projectId) throw new FleetError("Insight not found.", 404);
      await ref.delete();
      await audit("insight.deleted", { type: "insight", id: ref.id }, { title: existing.get("title") });
      return {};
    }

    case "theme.create": {
      const ref = col(tenantId, "themes").doc();
      await ref.set({ projectId, name: action.name, description: action.description, createdBy: user.uid, createdAt: now });
      await audit("theme.created", { type: "theme", id: ref.id }, { name: action.name });
      return { themeId: ref.id };
    }

    case "theme.delete": {
      const ref = col(tenantId, "themes").doc(action.themeId);
      const existing = await ref.get();
      if (!existing.exists || existing.get("projectId") !== projectId) throw new FleetError("Theme not found.", 404);
      const insights = await col(tenantId, "insights").where("themeId", "==", action.themeId).get();
      const batch = writer();
      insights.docs.forEach((doc) => batch.update(doc.ref, { themeId: null, updatedAt: now }));
      batch.delete(ref);
      await batch.commit();
      await audit("theme.deleted", { type: "theme", id: ref.id }, { name: existing.get("name"), insightsUngrouped: insights.size });
      return {};
    }

    case "tag.rename": {
      if (action.from === action.to) throw new FleetError("Choose a different tag name.", 400);
      const highlights = await col(tenantId, "highlights").where("projectId", "==", projectId).get();
      const batch = writer();
      let changed = 0;
      for (const doc of highlights.docs) {
        const tags = (doc.get("tags") as string[] | undefined) ?? [];
        if (!tags.includes(action.from)) continue;
        changed += 1;
        batch.update(doc.ref, { tags: [...new Set(tags.map((tag) => (tag === action.from ? action.to : tag)))] });
      }
      if (changed === 0) throw new FleetError("No highlights use that tag.", 404);
      await batch.commit();
      await audit("tag.renamed", { type: "tag", id: action.from }, { to: action.to, highlights: changed });
      return { changed };
    }

    case "dovetail.import": {
      let rows: DovetailRow[];
      try {
        rows =
          action.format === "csv"
            ? (parseCsv(action.content, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true }) as DovetailRow[])
            : rowsFromDovetailJson(JSON.parse(action.content));
      } catch {
        throw new FleetError(`That file is not valid ${action.format.toUpperCase()}.`, 400);
      }
      if (rows.length > MAX_IMPORT_ROWS) throw new FleetError(`Imports are limited to ${MAX_IMPORT_ROWS} rows per file.`, 400);
      const mapped = mapDovetailRows(rows);
      if (action.preview || mapped.highlights.length === 0) {
        return { preview: true, report: mapped.report, sources: mapped.sources.map((source) => ({ title: source.title, segments: source.segments.length })) };
      }
      const sourceIds = new Map<string, string>();
      let batch = db().batch();
      let ops = 0;
      const flush = async () => {
        if (ops === 0) return;
        await batch.commit();
        batch = db().batch();
        ops = 0;
      };
      for (const source of mapped.sources) {
        const ref = col(tenantId, "sources").doc();
        sourceIds.set(source.key, ref.id);
        batch.set(ref, {
          projectId,
          title: source.title,
          kind: "interview",
          format: "plain",
          fileName: "dovetail-import",
          participant: { name: source.participantName || "Imported participant", email: "", company: "" },
          consent: { status: "pending", capturedOn: "", retentionUntil: "", notes: "Imported from Dovetail — confirm consent before use." },
          segments: source.segments,
          originalText: null,
          redactionCount: 0,
          createdBy: user.uid,
          createdAt: now,
          updatedAt: now,
        });
        ops += 1;
        if (ops >= 400) await flush();
      }
      for (const highlight of mapped.highlights) {
        batch.set(col(tenantId, "highlights").doc(), {
          projectId,
          sourceId: sourceIds.get(highlight.sourceKey),
          segmentId: highlight.segmentId,
          start: highlight.start,
          end: highlight.end,
          quote: highlight.quote,
          tags: highlight.tags,
          note: highlight.note,
          stale: false,
          redacted: false,
          importedCreatedAt: highlight.createdAt,
          createdBy: user.uid,
          createdAt: now,
        });
        ops += 1;
        if (ops >= 400) await flush();
      }
      await flush();
      await audit("dovetail.imported", { type: "project", id: projectId }, {
        format: action.format,
        totalRows: mapped.report.totalRows,
        mappedRows: mapped.report.mappedRows,
        skippedRows: mapped.report.skipped.length,
        sources: mapped.sources.length,
      });
      return { preview: false, report: mapped.report };
    }
  }
}
