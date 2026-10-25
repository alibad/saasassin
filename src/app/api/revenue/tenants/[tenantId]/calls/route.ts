import { fleetApiError } from "@/lib/fleet/platform/http";
import { createCall, requireRevenueTenant } from "@/lib/revenue/data";
import { callSchema, WRITE_ROLES } from "@/lib/revenue/schemas";

type Context = { params: Promise<{ tenantId: string }> };

const CONSENT_REQUIRED = "Recording consent is required before a transcript can be stored.";

/** Logs a call from a transcript. Rejected with 422 unless recording-consent metadata is complete. */
export async function POST(request: Request, { params }: Context) {
  try {
    const { tenantId } = await params;
    const ctx = await requireRevenueTenant(tenantId, WRITE_ROLES);
    const body = await request.json();
    if (!body || typeof body !== "object" || !body.consent || body.consent.allPartyConfirmed !== true) {
      return Response.json({ error: CONSENT_REQUIRED }, { status: 422 });
    }
    const parsed = callSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const status = issue?.path[0] === "consent" ? 422 : 400;
      return Response.json({ error: issue?.message ?? "Check the submitted fields." }, { status });
    }
    return Response.json(await createCall(ctx, parsed.data), { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
