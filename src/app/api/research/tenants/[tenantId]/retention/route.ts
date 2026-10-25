import { z } from "zod";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { requireFleetUser } from "@/lib/fleet/platform/session";
import { applyRetention, listRetentionQueue, requireResearchMember } from "@/lib/research/data";
import { RESEARCH_SLUG } from "@/lib/research/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

/** Interviews whose retention date has passed or is near, or whose consent is missing or withdrawn. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    const { role } = await requireResearchMember(tenantId, user);
    return Response.json({ items: await listRetentionQueue(tenantId, { uid: user.uid, role }) });
  } catch (error) {
    return fleetApiError(error);
  }
}

const runSchema = z.object({ dryRun: z.boolean() });

/** Owners/admins preview (dryRun) or apply retention: deletes expired / withdrawn sources not under legal hold. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const user = await requireFleetUser(RESEARCH_SLUG);
    await requireResearchMember(tenantId, user, "manage");
    const { dryRun } = runSchema.parse(await request.json());
    return Response.json(await applyRetention(tenantId, user, { dryRun }));
  } catch (error) {
    return fleetApiError(error);
  }
}
