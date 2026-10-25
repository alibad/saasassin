import { z } from "zod";

import { requireSessionUser } from "@/lib/lattice/auth";
import { latticeApiError } from "@/lib/lattice/http";
import {
  acknowledgePacket,
  decideNomination,
  nominatePeers,
  reopenPacket,
  saveCalibration,
  sendCycleReminders,
  setCycleDeadline,
} from "@/lib/lattice/program-data";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("nominate"),
    subjectId: z.string().min(1),
    peerIds: z.array(z.string().min(1)).min(1).max(5),
  }),
  z.object({
    action: z.literal("decide_nomination"),
    nominationId: z.string().min(1),
    decision: z.enum(["approved", "declined"]),
  }),
  z.object({ action: z.literal("set_deadline"), dueDate: z.string().date().nullable() }),
  z.object({ action: z.literal("send_reminders") }),
  z.object({
    action: z.literal("calibrate"),
    subjectId: z.string().min(1),
    rating: z.number().int().min(1).max(5).nullable(),
    note: z.string().max(2000).default(""),
  }),
  z.object({ action: z.literal("acknowledge"), comment: z.string().max(4000).default("") }),
  z.object({
    action: z.literal("reopen_packet"),
    subjectId: z.string().min(1),
    reason: z.string().trim().min(3, "Explain why the packet is being reopened.").max(1000),
  }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; cycleId: string }> },
) {
  try {
    const actor = await requireSessionUser();
    const { organizationId, cycleId } = await context.params;
    const input = actionSchema.parse(await request.json());
    const scope = { actor, organizationId, cycleId };
    switch (input.action) {
      case "nominate":
        return Response.json(await nominatePeers({ ...scope, subjectId: input.subjectId, peerIds: input.peerIds }));
      case "decide_nomination":
        await decideNomination({ ...scope, nominationId: input.nominationId, decision: input.decision });
        return Response.json({ ok: true });
      case "set_deadline":
        await setCycleDeadline({ ...scope, dueDate: input.dueDate });
        return Response.json({ ok: true });
      case "send_reminders":
        return Response.json(await sendCycleReminders(scope));
      case "calibrate":
        await saveCalibration({ ...scope, subjectId: input.subjectId, rating: input.rating, note: input.note });
        return Response.json({ ok: true });
      case "acknowledge":
        await acknowledgePacket({ ...scope, comment: input.comment });
        return Response.json({ ok: true });
      case "reopen_packet":
        await reopenPacket({ ...scope, subjectId: input.subjectId, reason: input.reason });
        return Response.json({ ok: true });
    }
  } catch (error) {
    return latticeApiError(error);
  }
}
