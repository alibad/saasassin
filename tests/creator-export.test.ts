import { describe, expect, it } from "vitest";

import { buildCreatorExport, CREATOR_EXPORT_FILES } from "../src/lib/creator/export";

const timestamp = { toDate: () => new Date("2026-10-26T00:00:00.000Z") };

describe("creator export", () => {
  const payload = buildCreatorExport("tenant_1", {
    tenant: { name: "Studio", createdAt: timestamp },
    courses: [{ id: "c1", title: "Intro", modules: [{ id: "m1", lessons: [{ id: "l1" }] }] }],
    enrollments: [{ id: "c1_u1", completedLessonIds: ["l1"] }, { id: "c1_u2", completedLessonIds: [] }],
    leads: [],
    members: [{ uid: "u1", role: "owner", joinedAt: timestamp }],
    audit: [{ id: "a1", action: "course.published" }],
  });

  it("uses the shared manifest envelope", () => {
    expect(payload.manifest).toMatchObject({ schema: "net.saasassin.workspace-export", version: "1.0.0", product: "creator", tenantId: "tenant_1" });
  });

  it("lists every file with a versioned schema and record counts", () => {
    expect(payload.manifest.files.map((file) => file.path)).toEqual(CREATOR_EXPORT_FILES.map((name) => `${name}.json`));
    expect(payload.manifest.files.find((file) => file.path === "enrollments.json")).toEqual({ path: "enrollments.json", schema: "net.saasassin.creator.enrollments@1.0.0", records: 2 });
    expect(payload.manifest.files.find((file) => file.path === "school.json")?.records).toBe(1);
  });

  it("converts Firestore timestamps to ISO strings", () => {
    expect((payload.files["school.json"].data as { createdAt: string }).createdAt).toBe("2026-10-26T00:00:00.000Z");
    expect(JSON.stringify(payload)).not.toContain("toDate");
  });
});
