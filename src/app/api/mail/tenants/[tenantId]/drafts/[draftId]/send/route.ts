import { FieldValue } from "firebase-admin/firestore";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";
import { MAIL_PROVIDERS, SEND_NOT_CONFIGURED } from "@/lib/mail/provider";
import { MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { audit, mailCollection, mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string; draftId: string }> };

/** Sending goes through a provider adapter; with none configured the attempt is recorded and refused. */
export async function POST(_request: Request, { params }: Context) {
  try {
    const { draftId } = await params;
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    const ref = mailCollection(context.tenantId, "drafts").doc(draftId);
    if (!(await ref.get()).exists) throw new FleetError("Draft not found.", 404);
    const senders = MAIL_PROVIDERS.filter((provider) => provider.status().send);
    if (!senders.length) {
      await ref.set({ status: "send_blocked", lastSendAttemptAt: FieldValue.serverTimestamp() }, { merge: true });
      await audit(context, "draft.send_blocked", { type: "draft", id: draftId }, { reason: "provider_not_configured" });
      return Response.json({ error: SEND_NOT_CONFIGURED, status: "send_blocked" }, { status: 409 });
    }
    throw new FleetError(SEND_NOT_CONFIGURED, 409);
  } catch (error) {
    return fleetApiError(error);
  }
}
