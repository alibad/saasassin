import { FieldValue } from "firebase-admin/firestore";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { audit, col, plannerContext } from "@/lib/planner/data";
import { EDITOR_ROLES, taskInputSchema } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const ctx = await plannerContext(tenantId, EDITOR_ROLES);
    const input = taskInputSchema.parse(await request.json());
    const ref = col(tenantId, "tasks").doc();
    await ref.set({
      ...input,
      projectId: input.projectId ?? null,
      deadline: input.deadline ?? null,
      earliestStart: input.earliestStart ?? null,
      lockedStart: input.lockedStart ?? null,
      assigneeId: input.assigneeId ?? null,
      status: "todo",
      completedAt: null,
      createdBy: ctx.user.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    await audit(ctx, "task.created", { type: "task", id: ref.id }, { title: input.title, durationMinutes: input.durationMinutes });
    return Response.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
