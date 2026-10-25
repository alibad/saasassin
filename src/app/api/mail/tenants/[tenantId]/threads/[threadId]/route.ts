import { FieldValue } from "firebase-admin/firestore";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";
import { MAIL_WRITE_ROLES, threadActionSchema } from "@/lib/mail/schema";
import { audit, listThreadMessages, mailCollection, mailContext, toThread } from "@/lib/mail/store";
import { applyThreadAction, ThreadActionError, type ThreadRecord } from "@/lib/mail/workflow";

type Context = { params: Promise<{ tenantId: string; threadId: string }> };

async function loadThread(tenantId: string, threadId: string) {
  if (!/^t_[0-9a-f]{16}$/.test(threadId)) throw new FleetError("Thread not found.", 404);
  const snapshot = await mailCollection(tenantId, "threads").doc(threadId).get();
  if (!snapshot.exists) throw new FleetError("Thread not found.", 404);
  return toThread(snapshot.id, snapshot.data()!);
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const { threadId } = await params;
    const context = await mailContext(params);
    const thread = await loadThread(context.tenantId, threadId);
    return Response.json({ thread, messages: await listThreadMessages(context.tenantId, threadId) });
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Applies one triage action (archive, trash, star, read, snooze, label, follow-up reminder). */
export async function POST(request: Request, { params }: Context) {
  try {
    const { threadId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    const { action } = threadActionSchema.parse(await request.json());
    const thread = await loadThread(context.tenantId, threadId);
    let patch: Partial<ThreadRecord>;
    try {
      patch = applyThreadAction(thread, action, new Date());
    } catch (error) {
      if (error instanceof ThreadActionError) throw new FleetError(error.message, 400);
      throw error;
    }
    await mailCollection(context.tenantId, "threads").doc(threadId).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await audit(context, `thread.${action.type}`, { type: "thread", id: threadId }, { action });
    return Response.json({ thread: { ...thread, ...patch } });
  } catch (error) {
    return fleetApiError(error);
  }
}
