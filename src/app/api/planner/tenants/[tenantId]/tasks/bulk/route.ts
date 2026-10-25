import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { audit, col, plannerContext } from "@/lib/planner/data";
import { EDITOR_ROLES, taskInputSchema } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

const bulkSchema = z.object({
  tasks: z.array(taskInputSchema).min(1, "Add at least one task.").max(50, "Capture up to 50 tasks at a time."),
});

/** Quick capture / import: creates many tasks in one atomic batch. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const ctx = await plannerContext(tenantId, EDITOR_ROLES);
    const { tasks } = bulkSchema.parse(await request.json());
    const collection = col(tenantId, "tasks");
    const batch = collection.firestore.batch();
    const ids: string[] = [];
    for (const input of tasks) {
      const ref = collection.doc();
      ids.push(ref.id);
      batch.set(ref, {
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
    }
    await batch.commit();
    await audit(ctx, "task.bulk_created", { type: "task", id: ids[0] }, { count: ids.length, ids });
    return Response.json({ ids }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
