import { FieldValue } from "firebase-admin/firestore";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { FleetError } from "@/lib/fleet/platform/session";
import { draftSchema, MAIL_WRITE_ROLES } from "@/lib/mail/schema";
import { audit, listDrafts, mailCollection, mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const context = await mailContext(params);
    return Response.json({ drafts: await listDrafts(context.tenantId) });
  } catch (error) {
    return fleetApiError(error);
  }
}

/** Creates or updates a reply/compose draft. */
export async function POST(request: Request, { params }: Context) {
  try {
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    const input = draftSchema.parse(await request.json());
    const drafts = mailCollection(context.tenantId, "drafts");
    const ref = input.id ? drafts.doc(input.id) : drafts.doc();
    const existing = input.id ? await ref.get() : null;
    if (input.id && !existing?.exists) throw new FleetError("Draft not found.", 404);
    await ref.set(
      {
        threadId: input.threadId ?? null,
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        body: input.body,
        status: "draft",
        updatedBy: context.user.uid,
        updatedAt: FieldValue.serverTimestamp(),
        ...(existing ? {} : { createdBy: context.user.uid, createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
    await audit(context, existing ? "draft.updated" : "draft.created", { type: "draft", id: ref.id }, { threadId: input.threadId ?? null });
    return Response.json(
      { draft: { id: ref.id, threadId: input.threadId ?? null, to: input.to, cc: input.cc, subject: input.subject, body: input.body, status: "draft", updatedAt: new Date().toISOString() } },
      { status: existing ? 200 : 201 },
    );
  } catch (error) {
    return fleetApiError(error);
  }
}
