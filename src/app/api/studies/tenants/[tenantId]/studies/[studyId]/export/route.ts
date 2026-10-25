import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError, requireFleetUser } from "@/lib/fleet/platform/session";
import { appendAuditEvent } from "@/lib/fleet/platform/tenants";
import { blockResponsesToCsv, buildStudyExport } from "@/lib/studies/analysis";
import { getStudyResults, SLUG } from "@/lib/studies/data";

export async function GET(request: Request, context: { params: Promise<{ tenantId: string; studyId: string }> }) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, studyId } = await context.params;
    const url = new URL(request.url);
    const { study, versions, responses } = await getStudyResults(user, tenantId, studyId);
    const safeTitle =
      study.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "study";

    if (url.searchParams.get("format") === "csv") {
      const blockId = url.searchParams.get("blockId") ?? "";
      const version = versions.find((candidate) => candidate.version === study.currentVersion);
      const block = version?.blocks.find((candidate) => candidate.id === blockId);
      if (!version || !block) throw new FleetError("Block not found in the published version.", 404);
      const csv = blockResponsesToCsv(block, responses.filter((response) => response.version === version.version));
      await appendAuditEvent(SLUG, tenantId, user, "study.exported_csv", { type: "study", id: studyId }, { blockId });
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeTitle}-${blockId}.csv"`,
        },
      });
    }

    await appendAuditEvent(SLUG, tenantId, user, "study.exported_json", { type: "study", id: studyId }, {
      responses: responses.length,
    });
    return new Response(JSON.stringify(buildStudyExport(study, versions, responses), null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeTitle}-responses.json"`,
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
