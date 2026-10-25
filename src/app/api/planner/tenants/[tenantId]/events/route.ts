import { FieldValue } from "firebase-admin/firestore";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { audit, col, plannerContext } from "@/lib/planner/data";
import { EDITOR_ROLES, eventSchema } from "@/lib/planner/model";

type RouteContext = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { tenantId } = await params;
    const ctx = await plannerContext(tenantId, EDITOR_ROLES);
    const input = eventSchema.parse(await request.json());
    const ref = col(tenantId, "events").doc();
    const record = {
      title: input.title,
      start: new Date(input.start).toISOString(),
      end: new Date(input.end).toISOString(),
      memberId: input.memberId ?? null,
      source: "manual",
      createdBy: ctx.user.uid,
      createdAt: FieldValue.serverTimestamp(),
    };
    await ref.set(record);
    await audit(ctx, "event.created", { type: "event", id: ref.id }, { title: input.title, start: record.start, end: record.end });
    return Response.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
