import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { buildTrustExport, TRUST } from "@/lib/trust/data";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireFleetUser(TRUST);
    const { tenantId } = await params;
    const result = await buildTrustExport(tenantId, user, new URL(request.url).searchParams.get("package"));
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(result.body, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}-${stamp}.json"`,
      },
    });
  } catch (error) {
    return fleetApiError(error);
  }
}
