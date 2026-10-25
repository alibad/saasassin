import { FieldValue } from "firebase-admin/firestore";

import { fleetApiError } from "@/lib/fleet/platform/http";
import { MAIL_WRITE_ROLES, splitSchema } from "@/lib/mail/schema";
import { audit, listSplits, mailCollection, mailContext } from "@/lib/mail/store";

type Context = { params: Promise<{ tenantId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const context = await mailContext(params, MAIL_WRITE_ROLES);
    const input = splitSchema.parse(await request.json());
    const existing = await listSplits(context);
    const order = existing.reduce((max, split) => Math.max(max, split.order), 0) + 1;
    const value = input.kind === "from-domain" || input.kind === "from-address" ? input.value.toLowerCase() : input.value;
    const ref = await mailCollection(context.tenantId, "splits").add({ name: input.name, kind: input.kind, value, order, createdAt: FieldValue.serverTimestamp() });
    await audit(context, "split.created", { type: "split", id: ref.id }, { name: input.name, kind: input.kind, value });
    return Response.json({ split: { id: ref.id, name: input.name, kind: input.kind, value, order } }, { status: 201 });
  } catch (error) {
    return fleetApiError(error);
  }
}
