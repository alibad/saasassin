import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { exportStudy, SLUG } from "@/lib/studies/data";

export async function GET(request: Request, context: { params: Promise<{ tenantId: string; studyId: string }> }) {
  try {
    const user = await requireFleetUser(SLUG);
    const { tenantId, studyId } = await context.params;
    const url = new URL(request.url);
    const file = await exportStudy(user, tenantId, studyId, {
      format: url.searchParams.get("format") === "csv" ? "csv" : "json",
      blockId: url.searchParams.get("blockId") ?? undefined,
      includeExcluded: url.searchParams.get("all") === "1",
    });
    return new Response(file.body, {
      headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="${file.filename}"` },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
