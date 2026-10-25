import { FieldValue } from "firebase-admin/firestore";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { audit, col, plannerContext } from "@/lib/planner/data";
import { EDITOR_ROLES, projectSchema } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const ctx = await plannerContext(tenantId, EDITOR_ROLES);
    const input = projectSchema.parse(await request.json());
    const ref = col(tenantId, "projects").doc();
    await ref.set({ ...input, createdBy: ctx.user.uid, createdAt: FieldValue.serverTimestamp() });
    await audit(ctx, "project.created", { type: "project", id: ref.id }, { name: input.name });
    return Response.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
