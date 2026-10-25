import { z } from "zod";

import { requireSessionUser } from "@/lib/lattice/auth";
import { latticeApiError } from "@/lib/lattice/http";
import {
  checkInGoal,
  createGoal,
  createOneOnOne,
  giveFeedback,
  markNotificationsRead,
  updateOneOnOne,
} from "@/lib/lattice/program-data";

const goalStatus = z.enum(["on_track", "at_risk", "off_track", "done"]);

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_goal"),
    ownerId: z.string().min(1).nullable().default(null),
    title: z.string().trim().min(3, "Give the goal a title.").max(160),
    description: z.string().max(2000).default(""),
    dueDate: z.string().date().nullable().default(null),
    visibility: z.enum(["public", "manager"]).default("public"),
  }),
  z.object({
    action: z.literal("check_in_goal"),
    goalId: z.string().min(1),
    progress: z.number().int().min(0).max(100),
    status: goalStatus,
    note: z.string().max(1000).default(""),
  }),
  z.object({
    action: z.literal("give_feedback"),
    recipientId: z.string().min(1),
    kind: z.enum(["praise", "constructive"]),
    body: z.string().trim().min(3, "Write a little more feedback.").max(4000),
    visibility: z.enum(["private", "manager", "public"]).default("private"),
  }),
  z.object({
    action: z.literal("schedule_one_on_one"),
    counterpartId: z.string().min(1),
    scheduledFor: z.string().date(),
  }),
  z.object({ action: z.literal("add_agenda_item"), meetingId: z.string().min(1), text: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal("toggle_agenda_item"), meetingId: z.string().min(1), itemId: z.string().min(1) }),
  z.object({ action: z.literal("save_notes"), meetingId: z.string().min(1), sharedNotes: z.string().max(20000) }),
  z.object({ action: z.literal("complete_one_on_one"), meetingId: z.string().min(1) }),
  z.object({ action: z.literal("mark_notifications_read") }),
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const actor = await requireSessionUser();
    const { organizationId } = await context.params;
    const input = actionSchema.parse(await request.json());
    const scope = { actor, organizationId };
    switch (input.action) {
      case "create_goal":
        return Response.json({ goalId: await createGoal({ ...scope, ...input }) }, { status: 201 });
      case "check_in_goal":
        await checkInGoal({ ...scope, ...input });
        return Response.json({ ok: true });
      case "give_feedback":
        return Response.json({ feedbackId: await giveFeedback({ ...scope, ...input }) }, { status: 201 });
      case "schedule_one_on_one":
        return Response.json({ meetingId: await createOneOnOne({ ...scope, ...input }) }, { status: 201 });
      case "add_agenda_item":
        await updateOneOnOne({ ...scope, meetingId: input.meetingId, operation: { type: "add_agenda_item", text: input.text } });
        return Response.json({ ok: true });
      case "toggle_agenda_item":
        await updateOneOnOne({ ...scope, meetingId: input.meetingId, operation: { type: "toggle_agenda_item", itemId: input.itemId } });
        return Response.json({ ok: true });
      case "save_notes":
        await updateOneOnOne({ ...scope, meetingId: input.meetingId, operation: { type: "save_notes", sharedNotes: input.sharedNotes } });
        return Response.json({ ok: true });
      case "complete_one_on_one":
        await updateOneOnOne({ ...scope, meetingId: input.meetingId, operation: { type: "complete" } });
        return Response.json({ ok: true });
      case "mark_notifications_read":
        return Response.json(await markNotificationsRead(scope));
    }
  } catch (error) {
    return latticeApiError(error);
  }
}
