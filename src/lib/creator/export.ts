import { buildExportManifest, toPortable } from "../fleet/platform/export";

import { CREATOR_SLUG, EXPORT_SCHEMA_VERSION } from "./model";

export type CreatorExportInput = {
  tenant: Record<string, unknown>;
  courses: unknown[];
  enrollments: unknown[];
  leads: unknown[];
  comments?: unknown[];
  members: unknown[];
  audit: unknown[];
};

export const CREATOR_EXPORT_FILES = ["school", "courses", "enrollments", "leads", "comments", "members", "audit"] as const;

export function creatorFileSchema(name: (typeof CREATOR_EXPORT_FILES)[number]) {
  return `net.saasassin.creator.${name}@${EXPORT_SCHEMA_VERSION}`;
}

/** Pure: builds the complete, versioned school export from already-loaded records. */
export function buildCreatorExport(tenantId: string, input: CreatorExportInput) {
  const data: Record<(typeof CREATOR_EXPORT_FILES)[number], unknown> = {
    school: input.tenant,
    courses: input.courses,
    enrollments: input.enrollments,
    leads: input.leads,
    comments: input.comments ?? [],
    members: input.members,
    audit: input.audit,
  };
  const files = Object.fromEntries(
    CREATOR_EXPORT_FILES.map((name) => [`${name}.json`, { schema: creatorFileSchema(name), data: toPortable(data[name]) }]),
  ) as Record<string, { schema: string; data: unknown }>;
  const manifest = buildExportManifest(
    CREATOR_SLUG,
    tenantId,
    Object.entries(files).map(([path, file]) => ({
      path,
      schema: file.schema,
      records: Array.isArray(file.data) ? file.data.length : 1,
    })),
  );
  return { manifest, files };
}
