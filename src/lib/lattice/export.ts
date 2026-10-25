import { createHash } from "node:crypto";

/**
 * Complete Performance workspace export using the shared
 * `net.saasassin.workspace-export` manifest envelope (docs/fleet/architecture.md §6).
 *
 * File schemas are product-owned and versioned independently of the manifest.
 * Additive fields are a minor version bump; renamed or removed fields are a major
 * bump with migration notes in EXPORT_MIGRATION_NOTES.
 */
export const EXPORT_MANIFEST_SCHEMA = "net.saasassin.workspace-export";
export const EXPORT_MANIFEST_VERSION = "1.0.0";
export const PERFORMANCE_EXPORT_VERSION = "1.0.0";

export const EXPORT_FILES = [
  { path: "organization.json", collection: "organization", schema: "net.saasassin.performance.organization" },
  { path: "members.json", collection: "members", schema: "net.saasassin.performance.member" },
  { path: "teams.json", collection: "teams", schema: "net.saasassin.performance.team" },
  { path: "roles.json", collection: "roles", schema: "net.saasassin.performance.role" },
  { path: "review-templates.json", collection: "reviewTemplates", schema: "net.saasassin.performance.review-template" },
  { path: "review-cycles.json", collection: "reviewCycles", schema: "net.saasassin.performance.review-cycle" },
  { path: "reviews.json", collection: "reviews", schema: "net.saasassin.performance.review" },
  { path: "nominations.json", collection: "nominations", schema: "net.saasassin.performance.peer-nomination" },
  { path: "calibrations.json", collection: "calibrations", schema: "net.saasassin.performance.calibration" },
  { path: "packets.json", collection: "packets", schema: "net.saasassin.performance.review-packet" },
  { path: "goals.json", collection: "goals", schema: "net.saasassin.performance.goal" },
  { path: "feedback.json", collection: "feedback", schema: "net.saasassin.performance.feedback" },
  { path: "one-on-ones.json", collection: "oneOnOnes", schema: "net.saasassin.performance.one-on-one" },
  { path: "audit-events.json", collection: "auditEvents", schema: "net.saasassin.performance.audit-event" },
] as const;

export type ExportCollection = (typeof EXPORT_FILES)[number]["collection"];

export const EXPORT_MIGRATION_NOTES = [
  "1.0.0 — initial Performance export: directory, roles, templates, cycles, reviews, peer nominations, calibrations, packets, goals, feedback, one-to-ones and audit events.",
];

export type ExportRecord = Record<string, unknown> & { id: string };

export type WorkspaceExport = {
  manifest: {
    schema: typeof EXPORT_MANIFEST_SCHEMA;
    version: typeof EXPORT_MANIFEST_VERSION;
    product: "performance";
    tenantId: string;
    exportedAt: string;
    files: Array<{
      path: string;
      schema: string;
      version: string;
      records: number;
      sha256: string;
    }>;
    migrationNotes: string[];
  };
  files: Record<string, ExportRecord[]>;
};

/** Recursively sorts object keys so equal data always serializes identically. */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function buildWorkspaceExport(input: {
  tenantId: string;
  exportedAt: string;
  collections: Partial<Record<ExportCollection, ExportRecord[]>>;
}): WorkspaceExport {
  const files: Record<string, ExportRecord[]> = {};
  const manifestFiles: WorkspaceExport["manifest"]["files"] = [];
  for (const file of EXPORT_FILES) {
    const records = [...(input.collections[file.collection] ?? [])]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((record) => canonicalize(record) as ExportRecord);
    files[file.path] = records;
    manifestFiles.push({
      path: file.path,
      schema: file.schema,
      version: PERFORMANCE_EXPORT_VERSION,
      records: records.length,
      sha256: createHash("sha256").update(JSON.stringify(records)).digest("hex"),
    });
  }
  return {
    manifest: {
      schema: EXPORT_MANIFEST_SCHEMA,
      version: EXPORT_MANIFEST_VERSION,
      product: "performance",
      tenantId: input.tenantId,
      exportedAt: input.exportedAt,
      files: manifestFiles,
      migrationNotes: EXPORT_MIGRATION_NOTES,
    },
    files,
  };
}

/** Verifies an export against its own manifest (used by tests and importers). */
export function verifyWorkspaceExport(payload: WorkspaceExport) {
  const errors: string[] = [];
  if (payload.manifest.schema !== EXPORT_MANIFEST_SCHEMA) errors.push("Unknown manifest schema.");
  if (payload.manifest.product !== "performance") errors.push("Export is not a Performance workspace.");
  for (const file of payload.manifest.files) {
    const records = payload.files[file.path];
    if (!records) {
      errors.push(`Missing file ${file.path}.`);
      continue;
    }
    if (records.length !== file.records) errors.push(`${file.path} record count does not match the manifest.`);
    const digest = createHash("sha256").update(JSON.stringify(records)).digest("hex");
    if (digest !== file.sha256) errors.push(`${file.path} checksum does not match the manifest.`);
  }
  return errors;
}
