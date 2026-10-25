import { FieldValue } from "firebase-admin/firestore";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { MAIL_WRITE_ROLES, templateSchema } from "@/lib/mail/schema";
import { audit, mailCollection, mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    const input = templateSchema.parse(await request.json());
    const ref = await mailCollection(context.tenantId, "templates").add({ ...input, createdBy: context.user.uid, createdAt: FieldValue.serverTimestamp() });
    await audit(context, "template.created", { type: "template", id: ref.id }, { name: input.name });
    return Response.json({ template: { id: ref.id, ...input } }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
