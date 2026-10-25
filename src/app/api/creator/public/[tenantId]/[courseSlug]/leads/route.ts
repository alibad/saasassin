import { fleetApiError } from "@/lib/fleet/platform/http";
import { leadSchema } from "@/lib/creator/model";
import { captureLead } from "@/lib/creator/store";

type RouteContext = { params: Promise<{ tenantId: string; courseSlug: string }> };

/** Unauthenticated email-list capture; only accepted for published courses, with explicit consent. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId, courseSlug } = await params;
    const { email } = leadSchema.parse(await request.json());
    await captureLead(tenantId, courseSlug, email);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
