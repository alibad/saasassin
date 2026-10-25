import { requireSessionUser } from "@/lib/lattice/auth";
import { latticeApiError } from "@/lib/lattice/http";
import { exportWorkspace } from "@/lib/lattice/program-data";

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const actor = await requireSessionUser();
    const { organizationId } = await context.params;
    const payload = await exportWorkspace({ actor, organizationId });
    const day = payload.manifest.exportedAt.slice(0, 10);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="performance-export-${day}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return latticeApiError(error);
  }
}
